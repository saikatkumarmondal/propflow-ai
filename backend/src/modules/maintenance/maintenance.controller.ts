// backend/src/modules/maintenance/maintenance.controller.ts
import { Request, Response } from "express";
import { MaintenanceService } from "./maintenance.service";
import { sendSuccess } from "../../utils/response";
import { parseQuery } from "../../utils/queryBuilder";

const maintenanceService = new MaintenanceService();

const MAINTENANCE_QUERY_OPTIONS = {
  allowedFilters:    ["status", "priority"],
  allowedSortFields: ["createdAt", "priority", "scheduledAt", "completedAt"],
  defaultSortField:  "createdAt",
  searchFields:      ["title", "description"],
} as const;

export class MaintenanceController {
  async createRequest(req: Request, res: Response): Promise<void> {
    const result = await maintenanceService.createMaintenanceRequest(
      req.user!.organizationId!,
      req.user!.id,
      req.body
    );
    sendSuccess(res, result, "Maintenance request submitted", 201);
  }

  async getRequests(req: Request, res: Response): Promise<void> {
    const query  = parseQuery(req, MAINTENANCE_QUERY_OPTIONS);
    const result = await maintenanceService.getMaintenanceRequests(
      req.user!.organizationId!,
      query
    );
    sendSuccess(res, result);
  }

  async getMyJobs(req: Request, res: Response): Promise<void> {
    const query  = parseQuery(req, MAINTENANCE_QUERY_OPTIONS);
    const result = await maintenanceService.getTechnicianJobs(
      req.user!.organizationId!,
      req.user!.id,
      query
    );
    sendSuccess(res, result);
  }

  async getRequestById(req: Request, res: Response): Promise<void> {
    const result = await maintenanceService.getMaintenanceRequestById(
      req.user!.organizationId!,
      req.params.requestId
    );
    sendSuccess(res, result);
  }

  async assignTechnician(req: Request, res: Response): Promise<void> {
    const result = await maintenanceService.assignTechnician(
      req.user!.organizationId!,
      req.user!.id,
      req.params.requestId,
      req.body
    );
    sendSuccess(res, result, "Technician assigned");
  }

  async updateStatus(req: Request, res: Response): Promise<void> {
    const result = await maintenanceService.updateStatus(
      req.user!.organizationId!,
      req.user!.id,
      req.user!.role,
      req.params.requestId,
      req.body
    );
    sendSuccess(res, result, "Status updated");
  }

  async addCompletionReport(req: Request, res: Response): Promise<void> {
    const result = await maintenanceService.addCompletionReport(
      req.user!.organizationId!,
      req.user!.id,
      req.params.requestId,
      req.body
    );
    sendSuccess(res, result, "Completion report submitted");
  }

  async getSummary(req: Request, res: Response): Promise<void> {
    const result = await maintenanceService.getMaintenanceSummary(
      req.user!.organizationId!
    );
    sendSuccess(res, result);
  }
}