// backend/src/modules/maintenance/maintenance.service.ts
import { MaintenanceStatus } from "@prisma/client";
import { prisma } from "../../config/database";
import { createAuditLog } from "../../utils/auditLog";
import { sendEmail } from "../../utils/email";
import { buildResponse, ParsedQuery } from "../../utils/queryBuilder";
import { io } from "../../app";
import {
  CreateMaintenanceRequestInput,
  AssignTechnicianInput,
  UpdateMaintenanceStatusInput,
  AddCompletionNotesInput,
} from "./maintenance.schema";

// ── Status transition rules ──
const ALLOWED_TRANSITIONS: Record<string, MaintenanceStatus[]> = {
  OPEN:        ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED",   "CANCELLED"],
  COMPLETED:   [],
  CANCELLED:   [],
};

export class MaintenanceService {
  // ─── Create Request (Tenant or Manager) ─────────

  async createMaintenanceRequest(
    organizationId: string,
    requestedById: string,
    input: CreateMaintenanceRequestInput
  ) {
    // Verify unit belongs to org
    const unit = await prisma.unit.findFirst({
      where: { id: input.unitId, property: { organizationId } },
      include: { property: { select: { name: true } } },
    });
    if (!unit) throw new Error("Unit not found in this organization");

    const request = await prisma.maintenanceRequest.create({
      data: {
        organizationId,
        unitId:        input.unitId,
        requestedById,
        title:         input.title,
        description:   input.description,
        priority:      input.priority,
        status:        "OPEN",
      },
      include: {
        unit: {
          include: {
            property: { select: { id: true, name: true } },
          },
        },
      },
    });

    await createAuditLog({
      organizationId,
      userId:    requestedById,
      action:    "CREATE",
      entity:    "MaintenanceRequest",
      entityId:  request.id,
      newValues: { title: input.title, priority: input.priority },
    });

    // ── Notify all managers in org via socket ──
    io.to(`org:${organizationId}`).emit("maintenance:new", {
      requestId: request.id,
      title:     request.title,
      priority:  request.priority,
      unitId:    request.unitId,
    });

    // ── Email managers ──
    await this.notifyManagersOfNewRequest(organizationId, request);

    return request;
  }

  // ─── Get All Requests ────────────────────────────

  async getMaintenanceRequests(organizationId: string, query: ParsedQuery) {
    const statusFilter   = query.where["status"]   as string | undefined;
    const priorityFilter = query.where["priority"] as string | undefined;

    const where = {
      organizationId,
      ...(statusFilter   ? { status:   statusFilter   as MaintenanceStatus } : {}),
      ...(priorityFilter ? { priority: priorityFilter as any               } : {}),
    };

    const searchTerm = query.where["OR"] as any;

    const finalWhere = searchTerm
      ? {
          ...where,
          OR: [
            { title:       { contains: query.where["search"] as string ?? "", mode: "insensitive" as const } },
            { description: { contains: query.where["search"] as string ?? "", mode: "insensitive" as const } },
          ],
        }
      : where;

    const [requests, total] = await Promise.all([
      prisma.maintenanceRequest.findMany({
        where: finalWhere,
        include: {
          unit: {
            select: {
              unitNumber: true,
              property: { select: { id: true, name: true } },
            },
          },
          assignedTo: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          managedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: query.orderBy,
        skip:    query.skip,
        take:    query.take,
      }),
      prisma.maintenanceRequest.count({ where: finalWhere }),
    ]);

    return buildResponse(requests, total, query);
  }

  // ─── Get By Technician ───────────────────────────

  async getTechnicianJobs(
    organizationId: string,
    technicianId: string,
    query: ParsedQuery
  ) {
    const statusFilter = query.where["status"] as string | undefined;

    const where = {
      organizationId,
      assignedToId: technicianId,
      ...(statusFilter ? { status: statusFilter as MaintenanceStatus } : {}),
    };

    const [jobs, total] = await Promise.all([
      prisma.maintenanceRequest.findMany({
        where,
        include: {
          unit: {
            select: {
              unitNumber: true,
              property: { select: { name: true, address: true } },
            },
          },
        },
        orderBy: query.orderBy,
        skip:    query.skip,
        take:    query.take,
      }),
      prisma.maintenanceRequest.count({ where }),
    ]);

    return buildResponse(jobs, total, query);
  }

  // ─── Get Single Request ──────────────────────────

  async getMaintenanceRequestById(organizationId: string, requestId: string) {
    const request = await prisma.maintenanceRequest.findFirst({
      where: { id: requestId, organizationId },
      include: {
        unit: {
          include: {
            property: { select: { id: true, name: true, address: true } },
            floor:    { select: { floorNumber: true, name: true } },
          },
        },
        assignedTo: {
          select: {
            id: true, firstName: true, lastName: true,
            email: true, phone: true,
          },
        },
        managedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (!request) throw new Error("Maintenance request not found");
    return request;
  }

  // ─── Assign Technician ───────────────────────────

  async assignTechnician(
    organizationId: string,
    managerId: string,
    requestId: string,
    input: AssignTechnicianInput
  ) {
    const request = await this.resolveRequest(organizationId, requestId);

    if (request.status === "COMPLETED" || request.status === "CANCELLED") {
      throw new Error(`Cannot assign technician to a ${request.status.toLowerCase()} request`);
    }

    // Verify technician belongs to org and has correct role
    const technician = await prisma.user.findFirst({
      where: {
        id:             input.technicianId,
        organizationId,
        role:           "TECHNICIAN",
        status:         "ACTIVE",
      },
    });
    if (!technician) throw new Error("Technician not found in this organization");

    const updated = await prisma.maintenanceRequest.update({
      where: { id: requestId },
      data: {
        assignedToId: input.technicianId,
        managedById:  managerId,
        scheduledAt:  input.scheduledAt ? new Date(input.scheduledAt) : undefined,
        status:       "IN_PROGRESS",
      },
      include: {
        unit: {
          select: {
            unitNumber: true,
            property: { select: { name: true } },
          },
        },
      },
    });

    await createAuditLog({
      organizationId,
      userId:    managerId,
      action:    "ASSIGN",
      entity:    "MaintenanceRequest",
      entityId:  requestId,
      newValues: { assignedToId: input.technicianId },
    });

    // ── Notify technician via socket ──
    io.to(`user:${input.technicianId}`).emit("maintenance:assigned", {
      requestId:   updated.id,
      title:       updated.title,
      priority:    updated.priority,
      unitNumber:  updated.unit.unitNumber,
      property:    updated.unit.property.name,
      scheduledAt: updated.scheduledAt,
    });

    // ── Email technician ──
    await sendEmail({
      to:      technician.email,
      subject: `New Job Assigned — PropFlow AI`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <h2>Job Assigned</h2>
          <p>Hi ${technician.firstName},</p>
          <p>A maintenance job has been assigned to you.</p>
          <table style="width:100%;border-collapse:collapse;margin-top:16px;">
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Title</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">${updated.title}</td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Unit</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">
                ${updated.unit.unitNumber} — ${updated.unit.property.name}
              </td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Priority</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">${updated.priority}</td>
            </tr>
            ${
              updated.scheduledAt
                ? `<tr>
                     <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Scheduled</td>
                     <td style="padding:8px;border:1px solid #e5e7eb;">
                       ${new Date(updated.scheduledAt).toLocaleString()}
                     </td>
                   </tr>`
                : ""
            }
          </table>
          <p style="margin-top:16px;">Login to PropFlow AI to view full details.</p>
        </div>
      `,
    });

    return updated;
  }

  // ─── Update Status (Technician) ──────────────────

  async updateStatus(
    organizationId: string,
    userId: string,
    userRole: string,
    requestId: string,
    input: UpdateMaintenanceStatusInput
  ) {
    const request = await this.resolveRequest(organizationId, requestId);

    // Technician can only update their own assigned jobs
    if (
      userRole === "TECHNICIAN" &&
      request.assignedToId !== userId
    ) {
      throw new Error("You can only update jobs assigned to you");
    }

    const allowedNext = ALLOWED_TRANSITIONS[request.status] ?? [];
    if (!allowedNext.includes(input.status as MaintenanceStatus)) {
      throw new Error(
        `Cannot transition from ${request.status} to ${input.status}`
      );
    }

    const updated = await prisma.maintenanceRequest.update({
      where: { id: requestId },
      data: {
        status:           input.status as MaintenanceStatus,
        completionNotes:  input.completionNotes,
        completedAt:      input.status === "COMPLETED" ? new Date() : undefined,
      },
    });

    await createAuditLog({
      organizationId,
      userId,
      action:    "STATUS_UPDATE",
      entity:    "MaintenanceRequest",
      entityId:  requestId,
      oldValues: { status: request.status },
      newValues: { status: input.status },
    });

    // ── Notify org via socket ──
    io.to(`org:${organizationId}`).emit("maintenance:status_updated", {
      requestId: updated.id,
      status:    updated.status,
      updatedBy: userId,
    });

    // ── Notify tenant if COMPLETED ──
    if (input.status === "COMPLETED") {
      await this.notifyTenantOfCompletion(organizationId, requestId);
    }

    return updated;
  }

  // ─── Add Completion Report (Technician) ─────────

  async addCompletionReport(
    organizationId: string,
    technicianId: string,
    requestId: string,
    input: AddCompletionNotesInput
  ) {
    const request = await this.resolveRequest(organizationId, requestId);

    if (request.assignedToId !== technicianId) {
      throw new Error("You can only complete jobs assigned to you");
    }
    if (request.status === "COMPLETED") {
      throw new Error("Job is already marked as completed");
    }
    if (request.status === "CANCELLED") {
      throw new Error("Cannot complete a cancelled job");
    }

    const updated = await prisma.maintenanceRequest.update({
      where: { id: requestId },
      data: {
        status:           "COMPLETED",
        completionNotes:  input.completionNotes,
        completionImages: input.completionImages,
        completedAt:      new Date(),
      },
    });

    io.to(`org:${organizationId}`).emit("maintenance:completed", {
      requestId:   updated.id,
      title:       updated.title,
      completedAt: updated.completedAt,
    });

    await this.notifyTenantOfCompletion(organizationId, requestId);

    return updated;
  }

  // ─── Stats Summary ───────────────────────────────

  async getMaintenanceSummary(organizationId: string) {
    const [byStatus, byPriority, avgResolutionMs] = await Promise.all([
      prisma.maintenanceRequest.groupBy({
        by:    ["status"],
        where: { organizationId },
        _count: { status: true },
      }),
      prisma.maintenanceRequest.groupBy({
        by:    ["priority"],
        where: { organizationId, status: { not: "CANCELLED" } },
        _count: { priority: true },
      }),
      prisma.maintenanceRequest.findMany({
        where: {
          organizationId,
          status:      "COMPLETED",
          completedAt: { not: null },
        },
        select: { createdAt: true, completedAt: true },
      }),
    ]);

    const statusSummary = byStatus.reduce(
      (acc, item) => ({ ...acc, [item.status]: item._count.status }),
      {} as Record<string, number>
    );

    const prioritySummary = byPriority.reduce(
      (acc, item) => ({ ...acc, [item.priority]: item._count.priority }),
      {} as Record<string, number>
    );

    const avgResolutionHours =
      avgResolutionMs.length > 0
        ? Math.round(
            avgResolutionMs.reduce((sum, r) => {
              const diff =
                new Date(r.completedAt!).getTime() -
                new Date(r.createdAt).getTime();
              return sum + diff;
            }, 0) /
              avgResolutionMs.length /
              (1000 * 60 * 60)
          )
        : 0;

    return { statusSummary, prioritySummary, avgResolutionHours };
  }

  // ─── Private Helpers ─────────────────────────────

  private async resolveRequest(organizationId: string, requestId: string) {
    const request = await prisma.maintenanceRequest.findFirst({
      where: { id: requestId, organizationId },
    });
    if (!request) throw new Error("Maintenance request not found");
    return request;
  }

  private async notifyManagersOfNewRequest(
    organizationId: string,
    request: any
  ): Promise<void> {
    const managers = await prisma.user.findMany({
      where: {
        organizationId,
        role:   { in: ["PROPERTY_MANAGER", "MAINTENANCE_MANAGER", "PROPERTY_OWNER"] },
        status: "ACTIVE",
      },
      select: { email: true, firstName: true },
    });

    for (const manager of managers) {
      await sendEmail({
        to:      manager.email,
        subject: `[${request.priority}] New Maintenance Request — PropFlow AI`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <h2>New Maintenance Request</h2>
            <p>Hi ${manager.firstName}, a new maintenance request has been submitted.</p>
            <table style="width:100%;border-collapse:collapse;margin-top:16px;">
              <tr>
                <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Title</td>
                <td style="padding:8px;border:1px solid #e5e7eb;">${request.title}</td>
              </tr>
              <tr>
                <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Priority</td>
                <td style="padding:8px;border:1px solid #e5e7eb;
                           color:${request.priority === "URGENT" ? "#dc2626" : "#d97706"};">
                  ${request.priority}
                </td>
              </tr>
              <tr>
                <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Description</td>
                <td style="padding:8px;border:1px solid #e5e7eb;">${request.description}</td>
              </tr>
            </table>
            <p style="margin-top:16px;">Login to PropFlow AI to assign a technician.</p>
          </div>
        `,
      });
    }
  }

  private async notifyTenantOfCompletion(
    organizationId: string,
    requestId: string
  ): Promise<void> {
    const request = await prisma.maintenanceRequest.findFirst({
      where: { id: requestId, organizationId },
      include: {
        unit: {
          include: {
            leases: {
              where: { status: "ACTIVE" },
              include: {
                tenant: {
                  include: {
                    user: { select: { firstName: true, email: true } },
                  },
                },
              },
              take: 1,
            },
          },
        },
      },
    });

    const tenant = request?.unit?.leases?.[0]?.tenant?.user;
    if (!tenant?.email) return;

    await sendEmail({
      to:      tenant.email,
      subject: "Maintenance Request Completed — PropFlow AI",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <h2 style="color:#16a34a;">✓ Maintenance Completed</h2>
          <p>Hi ${tenant.firstName}, your maintenance request has been resolved.</p>
          <p><strong>${request?.title}</strong></p>
          ${request?.completionNotes
            ? `<p><strong>Notes:</strong> ${request.completionNotes}</p>`
            : ""}
          <p>If you have any concerns, please submit a new request.</p>
        </div>
      `,
    });
  }
}