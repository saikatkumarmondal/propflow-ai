// backend/src/modules/crm/crm.controller.ts
import { Request, Response } from "express";
import { CrmService } from "./crm.service";
import { sendSuccess } from "../../utils/response";
import { parseQuery } from "../../utils/queryBuilder";

const crmService = new CrmService();

const LEAD_QUERY_OPTIONS = {
  allowedFilters:    ["status", "source"],
  allowedSortFields: ["createdAt", "expectedBudget", "wonAt", "lostAt"],
  defaultSortField:  "createdAt",
  searchFields:      ["name", "email", "phone"],
} as const;

export class CrmController {
  // ─── Leads ───────────────────────────────────────

  async createLead(req: Request, res: Response): Promise<void> {
    const result = await crmService.createLead(
      req.user!.organizationId!,
      req.user!.id,
      req.body
    );
    sendSuccess(res, result, "Lead created", 201);
  }

  async getLeads(req: Request, res: Response): Promise<void> {
    const query  = parseQuery(req, LEAD_QUERY_OPTIONS);
    const result = await crmService.getLeads(req.user!.organizationId!, query);
    sendSuccess(res, result);
  }

  async getLeadById(req: Request, res: Response): Promise<void> {
    const result = await crmService.getLeadById(
      req.user!.organizationId!,
      req.params.leadId
    );
    sendSuccess(res, result);
  }

  async updateLead(req: Request, res: Response): Promise<void> {
    const result = await crmService.updateLead(
      req.user!.organizationId!,
      req.user!.id,
      req.params.leadId,
      req.body
    );
    sendSuccess(res, result, "Lead updated");
  }

  async updateLeadStatus(req: Request, res: Response): Promise<void> {
    const result = await crmService.updateLeadStatus(
      req.user!.organizationId!,
      req.user!.id,
      req.params.leadId,
      req.body
    );
    sendSuccess(res, result, "Lead status updated");
  }

  async deleteLead(req: Request, res: Response): Promise<void> {
    const result = await crmService.deleteLead(
      req.user!.organizationId!,
      req.user!.id,
      req.params.leadId
    );
    sendSuccess(res, result);
  }

  // ─── Assignment ──────────────────────────────────

  async assignLead(req: Request, res: Response): Promise<void> {
    const result = await crmService.assignLead(
      req.user!.organizationId!,
      req.user!.id,
      req.params.leadId,
      req.body
    );
    sendSuccess(res, result, "Lead assigned");
  }

  async getAgentLeads(req: Request, res: Response): Promise<void> {
    const query  = parseQuery(req, LEAD_QUERY_OPTIONS);
    const result = await crmService.getAgentLeads(
      req.user!.organizationId!,
      req.params.agentId,
      query
    );
    sendSuccess(res, result);
  }

  // ─── Visits ──────────────────────────────────────

  async scheduleVisit(req: Request, res: Response): Promise<void> {
    const result = await crmService.scheduleVisit(
      req.user!.organizationId!,
      req.user!.id,
      req.params.leadId,
      req.body
    );
    sendSuccess(res, result, "Visit scheduled", 201);
  }

  async markVisitCompleted(req: Request, res: Response): Promise<void> {
    const result = await crmService.markVisitCompleted(
      req.user!.organizationId!,
      req.params.visitId
    );
    sendSuccess(res, result, "Visit marked as completed");
  }

  async getVisitsByLead(req: Request, res: Response): Promise<void> {
    const result = await crmService.getVisitsByLead(
      req.user!.organizationId!,
      req.params.leadId
    );
    sendSuccess(res, result);
  }

  // ─── Analytics ───────────────────────────────────

  async getPipelineAnalytics(req: Request, res: Response): Promise<void> {
    const result = await crmService.getPipelineAnalytics(req.user!.organizationId!);
    sendSuccess(res, result);
  }
}