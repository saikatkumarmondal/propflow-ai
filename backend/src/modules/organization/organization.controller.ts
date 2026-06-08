// backend/src/modules/organization/organization.controller.ts
import { Request, Response } from "express";
import { OrganizationService } from "./organization.service";
import { sendSuccess, sendError } from "../../utils/response";
import { UserRole } from "@prisma/client";

const orgService = new OrganizationService();

export class OrganizationController {
  async getOrganization(req: Request, res: Response): Promise<void> {
    try {
      const result = await orgService.getOrganization(req.user!.organizationId!);
      sendSuccess(res, result);
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : "Failed", 404);
    }
  }

  async updateOrganization(req: Request, res: Response): Promise<void> {
    try {
      const result = await orgService.updateOrganization(req.user!.organizationId!, req.body);
      sendSuccess(res, result, "Organization updated");
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : "Update failed");
    }
  }

  async getMembers(req: Request, res: Response): Promise<void> {
    try {
      const result = await orgService.getOrganizationMembers(req.user!.organizationId!);
      sendSuccess(res, result);
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : "Failed");
    }
  }

  async inviteUser(req: Request, res: Response): Promise<void> {
    try {
      const result = await orgService.inviteUser(req.user!.organizationId!, req.body);
      sendSuccess(res, result, "Invitation sent", 201);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Invite failed";
      sendError(res, msg, msg.includes("already exists") ? 409 : 500);
    }
  }

  async removeMember(req: Request, res: Response): Promise<void> {
    try {
      const result = await orgService.removeMember(req.user!.organizationId!, req.params.userId);
      sendSuccess(res, result);
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : "Failed");
    }
  }

  async updateMemberRole(req: Request, res: Response): Promise<void> {
    try {
      const result = await orgService.updateMemberRole(
        req.user!.organizationId!,
        req.params.userId,
        req.body.role as UserRole
      );
      sendSuccess(res, result, "Role updated");
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : "Failed");
    }
  }
}