// backend/src/modules/property/property.controller.ts
import { Request, Response } from "express";
import { PropertyService } from "./property.service";
import { sendSuccess, sendError } from "../../utils/response";

const propertyService = new PropertyService();

export class PropertyController {
  // ─── Properties ─────────────────────────────────

  async createProperty(req: Request, res: Response): Promise<void> {
    const result = await propertyService.createProperty(
      req.user!.organizationId!,
      req.user!.id,
      req.body
    );
    sendSuccess(res, result, "Property created", 201);
  }

  async getProperties(req: Request, res: Response): Promise<void> {
    const result = await propertyService.getProperties(req.user!.organizationId!);
    sendSuccess(res, result);
  }

  async getPropertyById(req: Request, res: Response): Promise<void> {
    const result = await propertyService.getPropertyById(
      req.user!.organizationId!,
      req.params.propertyId
    );
    sendSuccess(res, result);
  }

  async updateProperty(req: Request, res: Response): Promise<void> {
    const result = await propertyService.updateProperty(
      req.user!.organizationId!,
      req.user!.id,
      req.params.propertyId,
      req.body
    );
    sendSuccess(res, result, "Property updated");
  }

  async deleteProperty(req: Request, res: Response): Promise<void> {
    const result = await propertyService.deleteProperty(
      req.user!.organizationId!,
      req.user!.id,
      req.params.propertyId
    );
    sendSuccess(res, result);
  }

  async getVacancySummary(req: Request, res: Response): Promise<void> {
    const result = await propertyService.getVacancySummary(req.user!.organizationId!);
    sendSuccess(res, result);
  }

  // ─── Buildings ──────────────────────────────────

  async createBuilding(req: Request, res: Response): Promise<void> {
    const result = await propertyService.createBuilding(
      req.user!.organizationId!,
      req.params.propertyId,
      req.body
    );
    sendSuccess(res, result, "Building created", 201);
  }

  async getBuildings(req: Request, res: Response): Promise<void> {
    const result = await propertyService.getBuildings(
      req.user!.organizationId!,
      req.params.propertyId
    );
    sendSuccess(res, result);
  }

  async updateBuilding(req: Request, res: Response): Promise<void> {
    const result = await propertyService.updateBuilding(req.params.buildingId, req.body);
    sendSuccess(res, result, "Building updated");
  }

  async deleteBuilding(req: Request, res: Response): Promise<void> {
    const result = await propertyService.deleteBuilding(req.params.buildingId);
    sendSuccess(res, result);
  }

  // ─── Floors ─────────────────────────────────────

  async createFloor(req: Request, res: Response): Promise<void> {
    const result = await propertyService.createFloor(req.params.buildingId, req.body);
    sendSuccess(res, result, "Floor created", 201);
  }

  async getFloors(req: Request, res: Response): Promise<void> {
    const result = await propertyService.getFloors(req.params.buildingId);
    sendSuccess(res, result);
  }

  async deleteFloor(req: Request, res: Response): Promise<void> {
    const result = await propertyService.deleteFloor(req.params.floorId);
    sendSuccess(res, result);
  }

  // ─── Units ──────────────────────────────────────

  async createUnit(req: Request, res: Response): Promise<void> {
    const result = await propertyService.createUnit(
      req.user!.organizationId!,
      req.params.propertyId,
      req.body
    );
    sendSuccess(res, result, "Unit created", 201);
  }

  async getUnits(req: Request, res: Response): Promise<void> {
    const status = req.query.status as string | undefined;
    const result = await propertyService.getUnits(
      req.user!.organizationId!,
      req.params.propertyId,
      { status }
    );
    sendSuccess(res, result);
  }

  async getUnitById(req: Request, res: Response): Promise<void> {
    const result = await propertyService.getUnitById(
      req.user!.organizationId!,
      req.params.unitId
    );
    sendSuccess(res, result);
  }

  async updateUnit(req: Request, res: Response): Promise<void> {
    const result = await propertyService.updateUnit(
      req.user!.organizationId!,
      req.params.unitId,
      req.body
    );
    sendSuccess(res, result, "Unit updated");
  }

  async deleteUnit(req: Request, res: Response): Promise<void> {
    const result = await propertyService.deleteUnit(
      req.user!.organizationId!,
      req.params.unitId
    );
    sendSuccess(res, result);
  }
}