// backend/src/modules/tenant/tenant.controller.ts
import { Request, Response } from "express";
import { TenantService } from "./tenant.service";
import { sendSuccess, sendError } from "../../utils/response";
import { parseQuery } from "../../utils/queryBuilder";
import { logger } from "../../config/logger";

const tenantService = new TenantService();

const TENANT_QUERY_OPTIONS = {
  allowedSortFields: ["createdAt"],
  defaultSortField: "createdAt",
  searchFields: ["firstName", "lastName", "email"],
} as const;

export class TenantController {
  async createTenant(req: Request, res: Response): Promise<void> {
    try {
      const result = await tenantService.createTenant(
        req.user!.organizationId!,
        req.user!.id,
        req.body
      );
      sendSuccess(res, result, "Tenant created", 201);
    } catch (error) {
      logger.error("CREATE TENANT ERROR:", error);
      const message = error instanceof Error ? error.message : "Failed to create tenant";
      const status = message.includes("already exists") ? 409 : 500;
      sendError(res, message, status);
    }
  }

  async getTenants(req: Request, res: Response): Promise<void> {
    try {
      const query = parseQuery(req, TENANT_QUERY_OPTIONS);
      const result = await tenantService.getTenants(req.user!.organizationId!, query);
      sendSuccess(res, result);
    } catch (error) {
      logger.error("GET TENANTS ERROR:", error);
      sendError(res, "Failed to fetch tenants");
    }
  }

  async getTenantById(req: Request, res: Response): Promise<void> {
    try {
      const result = await tenantService.getTenantById(
        req.user!.organizationId!,
        req.params.tenantId
      );
      sendSuccess(res, result);
    } catch (error) {
      logger.error("GET TENANT ERROR:", error);
      const message = error instanceof Error ? error.message : "Tenant not found";
      sendError(res, message, 404);
    }
  }

  async updateTenant(req: Request, res: Response): Promise<void> {
    try {
      const result = await tenantService.updateTenant(
        req.user!.organizationId!,
        req.params.tenantId,
        req.body
      );
      sendSuccess(res, result, "Tenant updated");
    } catch (error) {
      logger.error("UPDATE TENANT ERROR:", error);
      const message = error instanceof Error ? error.message : "Failed to update tenant";
      sendError(res, message, 500);
    }
  }

  async deleteTenant(req: Request, res: Response): Promise<void> {
    try {
      const result = await tenantService.deleteTenant(
        req.user!.organizationId!,
        req.params.tenantId
      );
      sendSuccess(res, result);
    } catch (error) {
      logger.error("DELETE TENANT ERROR:", error);
      const message = error instanceof Error ? error.message : "Failed to delete tenant";
      const status = message.includes("active lease") ? 403 : 500;
      sendError(res, message, status);
    }
  }
}