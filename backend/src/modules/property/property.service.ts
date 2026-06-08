// backend/src/modules/property/property.service.ts
import slugify from "slugify";
import crypto from "crypto";
import { UnitStatus, PropertyType } from "@prisma/client";
import { prisma } from "../../config/database";
import { createAuditLog } from "../../utils/auditLog";
import { parseQuery, buildResponse, ParsedQuery } from "../../utils/queryBuilder";
import {
  CreatePropertyInput,
  UpdatePropertyInput,
  CreateBuildingInput,
  CreateFloorInput,
  CreateUnitInput,
  UpdateUnitInput,
} from "./property.schema";

export class PropertyService {
  // ─── Properties ─────────────────────────────────

  async createProperty(
    organizationId: string,
    userId: string,
    input: CreatePropertyInput
  ) {
    const baseSlug = slugify(input.name, { lower: true, strict: true });
    const uniqueSuffix = crypto.randomBytes(3).toString("hex");
    const slug = `${baseSlug}-${uniqueSuffix}`;

    const property = await prisma.property.create({
      data: {
        ...input,
        slug,
        organizationId,
        latitude: input.latitude ?? undefined,
        longitude: input.longitude ?? undefined,
      },
    });

    await createAuditLog({
      organizationId,
      userId,
      action: "CREATE",
      entity: "Property",
      entityId: property.id,
      newValues: { name: property.name },
    });

    return property;
  }

  async getProperties(organizationId: string, query: ParsedQuery) {
    const where = {
      organizationId,
      isActive: true,
      ...query.where,
    };

    const [properties, total] = await Promise.all([
      prisma.property.findMany({
        where,
        include: { _count: { select: { buildings: true, units: true } } },
        orderBy: query.orderBy,
        skip: query.skip,
        take: query.take,
      }),
      prisma.property.count({ where }),
    ]);

    return buildResponse(properties, total, query);
  }

  async getPropertyById(organizationId: string, propertyId: string) {
    await this.resolveProperty(organizationId, propertyId);

    return prisma.property.findFirst({
      where: { id: propertyId, organizationId, isActive: true },
      include: {
        buildings: {
          include: {
            floors: {
              include: {
                units: {
                  select: {
                    id: true,
                    unitNumber: true,
                    unitType: true,
                    rentAmount: true,
                    currency: true,
                    status: true,
                    bedrooms: true,
                    bathrooms: true,
                    sizeSqft: true,
                  },
                },
              },
              orderBy: { floorNumber: "asc" },
            },
          },
        },
        units: { where: { floorId: null }, orderBy: { unitNumber: "asc" } },
        _count: { select: { units: true } },
      },
    });
  }

  async updateProperty(
    organizationId: string,
    userId: string,
    propertyId: string,
    input: UpdatePropertyInput
  ) {
    const existing = await this.resolveProperty(organizationId, propertyId);

    const updated = await prisma.property.update({
      where: { id: propertyId },
      data: input,
    });

    await createAuditLog({
      organizationId,
      userId,
      action: "UPDATE",
      entity: "Property",
      entityId: propertyId,
      oldValues: { name: existing.name },
      newValues: input as Record<string, unknown>,
    });

    return updated;
  }

  async deleteProperty(organizationId: string, userId: string, propertyId: string) {
    await this.resolveProperty(organizationId, propertyId);

    const activeLeases = await prisma.lease.count({
      where: { unit: { propertyId }, status: "ACTIVE" },
    });
    if (activeLeases > 0) throw new Error("Cannot delete property with active leases");

    await prisma.property.update({ where: { id: propertyId }, data: { isActive: false } });

    await createAuditLog({
      organizationId,
      userId,
      action: "DELETE",
      entity: "Property",
      entityId: propertyId,
    });

    return { message: "Property deleted successfully" };
  }

  async getVacancySummary(organizationId: string) {
    const units = await prisma.unit.groupBy({
      by: ["status"],
      where: { property: { organizationId, isActive: true } },
      _count: { status: true },
    });

    const summary = units.reduce(
      (acc, item) => ({ ...acc, [item.status]: item._count.status }),
      {} as Record<string, number>
    );

    const total = Object.values(summary).reduce((a, b) => a + b, 0);
    const occupied = summary["OCCUPIED"] ?? 0;

    return {
      summary,
      total,
      occupancyRate: total > 0 ? Math.round((occupied / total) * 100) : 0,
    };
  }

  // ─── Buildings ──────────────────────────────────

  async createBuilding(
    organizationId: string,
    propertyId: string,
    input: CreateBuildingInput
  ) {
    await this.resolveProperty(organizationId, propertyId);

    const duplicate = await prisma.building.findFirst({
      where: { propertyId, name: input.name },
    });
    if (duplicate) throw new Error("A building with this name already exists in the property");

    return prisma.building.create({ data: { ...input, propertyId } });
  }

  async getBuildings(
    organizationId: string,
    propertyId: string,
    query: ParsedQuery
  ) {
    await this.resolveProperty(organizationId, propertyId);

    const where = { propertyId, ...query.where };

    const [buildings, total] = await Promise.all([
      prisma.building.findMany({
        where,
        include: { _count: { select: { floors: true } } },
        orderBy: query.orderBy,
        skip: query.skip,
        take: query.take,
      }),
      prisma.building.count({ where }),
    ]);

    return buildResponse(buildings, total, query);
  }

  async updateBuilding(
    organizationId: string,
    propertyId: string,
    buildingId: string,
    input: Partial<CreateBuildingInput>
  ) {
    await this.resolveProperty(organizationId, propertyId);
    await this.resolveBuilding(propertyId, buildingId);

    return prisma.building.update({ where: { id: buildingId }, data: input });
  }

  async deleteBuilding(
    organizationId: string,
    propertyId: string,
    buildingId: string
  ) {
    await this.resolveProperty(organizationId, propertyId);
    await this.resolveBuilding(propertyId, buildingId);

    const activeLeases = await prisma.lease.count({
      where: { unit: { floor: { buildingId } }, status: "ACTIVE" },
    });
    if (activeLeases > 0) throw new Error("Cannot delete building with active leases");

    await prisma.building.delete({ where: { id: buildingId } });
    return { message: "Building deleted successfully" };
  }

  // ─── Floors ─────────────────────────────────────

  async createFloor(
    organizationId: string,
    propertyId: string,
    buildingId: string,
    input: CreateFloorInput
  ) {
    await this.resolveProperty(organizationId, propertyId);
    await this.resolveBuilding(propertyId, buildingId);

    const duplicate = await prisma.floor.findFirst({
      where: { buildingId, floorNumber: input.floorNumber },
    });
    if (duplicate) throw new Error("Floor number already exists in this building");

    return prisma.floor.create({ data: { ...input, buildingId } });
  }

  async getFloors(
    organizationId: string,
    propertyId: string,
    buildingId: string,
    query: ParsedQuery
  ) {
    await this.resolveProperty(organizationId, propertyId);
    await this.resolveBuilding(propertyId, buildingId);

    const where = { buildingId, ...query.where };

    const [floors, total] = await Promise.all([
      prisma.floor.findMany({
        where,
        include: { _count: { select: { units: true } } },
        orderBy: query.orderBy,
        skip: query.skip,
        take: query.take,
      }),
      prisma.floor.count({ where }),
    ]);

    return buildResponse(floors, total, query);
  }

  async deleteFloor(
    organizationId: string,
    propertyId: string,
    buildingId: string,
    floorId: string
  ) {
    await this.resolveProperty(organizationId, propertyId);
    await this.resolveBuilding(propertyId, buildingId);
    await this.resolveFloor(buildingId, floorId);

    const activeLeases = await prisma.lease.count({
      where: { unit: { floorId }, status: "ACTIVE" },
    });
    if (activeLeases > 0) throw new Error("Cannot delete floor with active leases");

    await prisma.floor.delete({ where: { id: floorId } });
    return { message: "Floor deleted successfully" };
  }

  // ─── Units ──────────────────────────────────────

  async createUnit(
    organizationId: string,
    propertyId: string,
    input: CreateUnitInput
  ) {
    await this.resolveProperty(organizationId, propertyId);

    if (input.floorId) {
      const floor = await prisma.floor.findUnique({ where: { id: input.floorId } });
      if (!floor) throw new Error("Floor not found");

      const building = await prisma.building.findFirst({
        where: { id: floor.buildingId, propertyId },
      });
      if (!building) throw new Error("Floor does not belong to this property");
    }

    const duplicate = await prisma.unit.findFirst({
      where: { propertyId, unitNumber: input.unitNumber },
    });
    if (duplicate) throw new Error("Unit number already exists in this property");

    return prisma.unit.create({ data: { ...input, propertyId } });
  }

  async getUnits(
    organizationId: string,
    propertyId: string,
    query: ParsedQuery
  ) {
    await this.resolveProperty(organizationId, propertyId);

    const where = { propertyId, ...query.where };

    const [units, total] = await Promise.all([
      prisma.unit.findMany({
        where,
        include: {
          floor: { select: { floorNumber: true, name: true } },
          leases: {
            where: { status: "ACTIVE" },
            include: {
              tenant: {
                include: {
                  user: {
                    select: {
                      firstName: true,
                      lastName: true,
                      email: true,
                      phone: true,
                    },
                  },
                },
              },
            },
            take: 1,
          },
        },
        orderBy: query.orderBy,
        skip: query.skip,
        take: query.take,
      }),
      prisma.unit.count({ where }),
    ]);

    return buildResponse(units, total, query);
  }

  async getUnitById(organizationId: string, unitId: string) {
    const unit = await prisma.unit.findFirst({
      where: { id: unitId, property: { organizationId } },
      include: {
        property: { select: { id: true, name: true, address: true } },
        floor: true,
        leases: {
          orderBy: { createdAt: "desc" },
          include: {
            tenant: {
              include: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                    email: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },
        maintenanceRequests: {
          where: { status: { not: "CANCELLED" } },
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    });

    if (!unit) throw new Error("Unit not found");
    return unit;
  }

  async updateUnit(
    organizationId: string,
    propertyId: string,
    unitId: string,
    input: UpdateUnitInput
  ) {
    await this.resolveProperty(organizationId, propertyId);

    const unit = await prisma.unit.findFirst({ where: { id: unitId, propertyId } });
    if (!unit) throw new Error("Unit not found in this property");

    return prisma.unit.update({ where: { id: unitId }, data: input });
  }

  async deleteUnit(organizationId: string, propertyId: string, unitId: string) {
    await this.resolveProperty(organizationId, propertyId);

    const unit = await prisma.unit.findFirst({ where: { id: unitId, propertyId } });
    if (!unit) throw new Error("Unit not found in this property");

    const activeLeases = await prisma.lease.count({
      where: { unitId, status: "ACTIVE" },
    });
    if (activeLeases > 0) throw new Error("Cannot delete unit with active lease");

    await prisma.unit.delete({ where: { id: unitId } });
    return { message: "Unit deleted successfully" };
  }

  // ─── Private Resolvers ───────────────────────────

  private async resolveProperty(organizationId: string, propertyId: string) {
    const property = await prisma.property.findFirst({
      where: { id: propertyId, organizationId, isActive: true },
    });
    if (!property) throw new Error("Property not found");
    return property;
  }

  private async resolveBuilding(propertyId: string, buildingId: string) {
    const building = await prisma.building.findFirst({
      where: { id: buildingId, propertyId },
    });
    if (!building) throw new Error("Building not found in this property");
    return building;
  }

  private async resolveFloor(buildingId: string, floorId: string) {
    const floor = await prisma.floor.findFirst({
      where: { id: floorId, buildingId },
    });
    if (!floor) throw new Error("Floor not found in this building");
    return floor;
  }
}