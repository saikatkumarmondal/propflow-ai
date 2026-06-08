// backend/src/modules/lease/lease.controller.ts
import { Request, Response } from "express";
import { LeaseService } from "./lease.service";
import { sendSuccess } from "../../utils/response";
import { parseQuery } from "../../utils/queryBuilder";

const leaseService = new LeaseService();

const LEASE_QUERY_OPTIONS = {
  allowedFilters:    ["status"],
  allowedSortFields: ["startDate", "endDate", "rentAmount", "createdAt"],
  defaultSortField:  "createdAt",
  searchFields:      [],
} as const;

export class LeaseController {
  async createLease(req: Request, res: Response): Promise<void> {
    const result = await leaseService.createLease(
      req.user!.organizationId!,
      req.user!.id,
      req.body
    );
    sendSuccess(res, result, "Lease created", 201);
  }

  async getLeases(req: Request, res: Response): Promise<void> {
    const query = parseQuery(req, LEASE_QUERY_OPTIONS);
    const result = await leaseService.getLeases(req.user!.organizationId!, query);
    sendSuccess(res, result);
  }

  async getLeaseById(req: Request, res: Response): Promise<void> {
    const result = await leaseService.getLeaseById(
      req.user!.organizationId!,
      req.params.leaseId
    );
    sendSuccess(res, result);
  }

  async renewLease(req: Request, res: Response): Promise<void> {
    const result = await leaseService.renewLease(
      req.user!.organizationId!,
      req.user!.id,
      req.params.leaseId,
      req.body
    );
    sendSuccess(res, result, "Lease renewed");
  }

  async terminateLease(req: Request, res: Response): Promise<void> {
    const result = await leaseService.terminateLease(
      req.user!.organizationId!,
      req.user!.id,
      req.params.leaseId,
      req.body
    );
    sendSuccess(res, result);
  }

  async getExpiringLeases(req: Request, res: Response): Promise<void> {
    const result = await leaseService.getExpiringLeases(req.user!.organizationId!);
    sendSuccess(res, result);
  }
}