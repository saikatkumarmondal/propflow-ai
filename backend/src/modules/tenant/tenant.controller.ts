// backend/src/modules/tenant/tenant.controller.ts
import { Request, Response } from "express";
import { TenantService } from "./tenant.service";
import { sendSuccess } from "../../utils/response";
import { parseQuery } from "../../utils/queryBuilder";

const tenantService = new TenantService();

const TENANT_QUERY_OPTIONS = {
  allowedSortFields: ["createdAt"],
  defaultSortField: "createdAt",
  searchFields: ["firstName", "lastName", "email"],
} as const;

export class TenantController {
  async createTenant(req: Request, res: Response): Promise<void> {
    const result = await tenantService.createTenant(
      req.user!.organizationId!,
      req.user!.id,
      req.body
    );
    sendSuccess(res, result, "Tenant created", 201);
  }

  async getTenants(req: Request, res: Response): Promise<void> {
    const query = parseQuery(req, TENANT_QUERY_OPTIONS);
    const result = await tenantService.getTenants(req.user!.organizationId!, query);
    sendSuccess(res, result);
  }

  async getTenantById(req: Request, res: Response): Promise<void> {
    const result = await tenantService.getTenantById(
      req.user!.organizationId!,
      req.params.tenantId
    );
    sendSuccess(res, result);
  }

  async updateTenant(req: Request, res: Response): Promise<void> {
    const result = await tenantService.updateTenant(
      req.user!.organizationId!,
      req.params.tenantId,
      req.body
    );
    sendSuccess(res, result, "Tenant updated");
  }

  async deleteTenant(req: Request, res: Response): Promise<void> {
    const result = await tenantService.deleteTenant(
      req.user!.organizationId!,
      req.params.tenantId
    );
    sendSuccess(res, result);
  }
}