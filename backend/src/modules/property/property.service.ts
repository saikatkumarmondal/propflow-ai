// backend/src/modules/property/property.service.ts
import slugify from "slugify";
import crypto from "crypto";
import { prisma } from "../../config/database";
import { createAuditLog } from "../../utils/auditLog";
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
        latitude: input.latitude ? input.latitude : undefined,
        longitude: input.longitude ? input.longitude : undefined,
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

  async getProperties(organizationId: string) {
    return prisma.property.findMany({
      where: { organizationId, isActive: true },
      include: {
        _count: {
          select: { buildings: true, units: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async getPropertyById(organizationId: string, propertyId: string) {
    const property = await prisma.property.findFirst({
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
        units: {
          where: { floorId: null },
          orderBy: { unitNumber: "asc" },
        },
        _count: {
          select: { units: true },
        },
      },
    });

    if (!property) throw new Error("Property not found");
    return property;
  }

  async updateProperty(
    organizationId: string,
    userId: string,
    propertyId: string,
    input: UpdatePropertyInput
  ) {
    const existing = await prisma.property.findFirst({
      where: { id: propertyId, organizationId },
    });
    if (!existing) throw new Error("Property not found");

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
    const existing = await prisma.property.findFirst({
      where: { id: propertyId, organizationId },
    });
    if (!existing) throw new Error("Property not found");

    // Soft delete
    await prisma.property.update({
      where: { id: propertyId },
      data: { isActive: false },
    });

    await createAuditLog({
      organizationId,
      userId,
      action: "DELETE",
      entity: "Property",
      entityId: propertyId,
    });

    return { message: "Property deleted successfully" };
  }

  // ─── Buildings ──────────────────────────────────

  async createBuilding(
    organizationId: string,
    propertyId: string,
    input: CreateBuildingInput
  ) {
    await this.verifyPropertyOwnership(organizationId, propertyId);

    return prisma.building.create({
      data: { ...input, propertyId },
    });
  }

  async getBuildings(organizationId: string, propertyId: string) {
    await this.verifyPropertyOwnership(organizationId, propertyId);

    return prisma.building.findMany({
      where: { propertyId },
      include: {
        _count: { select: { floors: true } },
      },
      orderBy: { name: "asc" },
    });
  }

  async updateBuilding(buildingId: string, input: Partial<CreateBuildingInput>) {
    return prisma.building.update({
      where: { id: buildingId },
      data: input,
    });
  }

  async deleteBuilding(buildingId: string) {
    await prisma.building.delete({ where: { id: buildingId } });
    return { message: "Building deleted" };
  }

  // ─── Floors ─────────────────────────────────────

  async createFloor(buildingId: string, input: CreateFloorInput) {
    const existing = await prisma.floor.findFirst({
      where: { buildingId, floorNumber: input.floorNumber },
    });

    if (existing) throw new Error("Floor number already exists in this building");

    return prisma.floor.create({
      data: { ...input, buildingId },
    });
  }

  async getFloors(buildingId: string) {
    return prisma.floor.findMany({
      where: { buildingId },
      include: {
        _count: { select: { units: true } },
      },
      orderBy: { floorNumber: "asc" },
    });
  }

  async deleteFloor(floorId: string) {
    await prisma.floor.delete({ where: { id: floorId } });
    return { message: "Floor deleted" };
  }

  // ─── Units ──────────────────────────────────────

  async createUnit(
    organizationId: string,
    propertyId: string,
    input: CreateUnitInput
  ) {
    await this.verifyPropertyOwnership(organizationId, propertyId);

    const existing = await prisma.unit.findFirst({
      where: { propertyId, unitNumber: input.unitNumber },
    });
    if (existing) throw new Error("Unit number already exists in this property");

    return prisma.unit.create({
      data: {
        ...input,
        propertyId,
        rentAmount: input.rentAmount,
      },
    });
  }

  async getUnits(
    organizationId: string,
    propertyId: string,
    filters?: { status?: string }
  ) {
    await this.verifyPropertyOwnership(organizationId, propertyId);

    return prisma.unit.findMany({
      where: {
        propertyId,
        ...(filters?.status ? { status: filters.status as any } : {}),
      },
      include: {
        floor: { select: { floorNumber: true, name: true } },
        leases: {
          where: { status: "ACTIVE" },
          include: {
            tenant: {
              include: {
                user: {
                  select: { firstName: true, lastName: true, email: true, phone: true },
                },
              },
            },
          },
          take: 1,
        },
      },
      orderBy: { unitNumber: "asc" },
    });
  }

  async getUnitById(organizationId: string, unitId: string) {
    const unit = await prisma.unit.findFirst({
      where: {
        id: unitId,
        property: { organizationId },
      },
      include: {
        property: { select: { id: true, name: true, address: true } },
        floor: true,
        leases: {
          orderBy: { createdAt: "desc" },
          include: {
            tenant: {
              include: {
                user: {
                  select: { firstName: true, lastName: true, email: true, phone: true },
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
    unitId: string,
    input: UpdateUnitInput
  ) {
    const unit = await prisma.unit.findFirst({
      where: { id: unitId, property: { organizationId } },
    });
    if (!unit) throw new Error("Unit not found");

    return prisma.unit.update({
      where: { id: unitId },
      data: input,
    });
  }

  async deleteUnit(organizationId: string, unitId: string) {
    const unit = await prisma.unit.findFirst({
      where: { id: unitId, property: { organizationId } },
    });
    if (!unit) throw new Error("Unit not found");

    const activeLeases = await prisma.lease.count({
      where: { unitId, status: "ACTIVE" },
    });
    if (activeLeases > 0) throw new Error("Cannot delete unit with active lease");

    await prisma.unit.delete({ where: { id: unitId } });
    return { message: "Unit deleted successfully" };
  }

  async getVacancySummary(organizationId: string) {
    const units = await prisma.unit.groupBy({
      by: ["status"],
      where: { property: { organizationId, isActive: true } },
      _count: { status: true },
    });

    const summary = units.reduce(
      (acc, item) => {
        acc[item.status] = item._count.status;
        return acc;
      },
      {} as Record<string, number>
    );

    const total = Object.values(summary).reduce((a, b) => a + b, 0);
    const occupied = summary["OCCUPIED"] ?? 0;
    const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0;

    return { summary, total, occupancyRate };
  }

  // ─── Private Helpers ────────────────────────────

  private async verifyPropertyOwnership(
    organizationId: string,
    propertyId: string
  ): Promise<void> {
    const property = await prisma.property.findFirst({
      where: { id: propertyId, organizationId, isActive: true },
    });
    if (!property) throw new Error("Property not found");
  }
}