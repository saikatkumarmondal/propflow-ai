// backend/src/modules/crm/crm.service.ts
import dayjs from "dayjs";
import { LeadStatus } from "@prisma/client";
import { prisma } from "../../config/database";
import { createAuditLog } from "../../utils/auditLog";
import { sendEmail } from "../../utils/email";
import { buildResponse, ParsedQuery } from "../../utils/queryBuilder";
import { io } from "../../app";
import {
  CreateLeadInput,
  UpdateLeadInput,
  UpdateLeadStatusInput,
  ScheduleVisitInput,
  AssignLeadInput,
} from "./crm.schema";

// ── Pipeline transition rules ──
const ALLOWED_PIPELINE_TRANSITIONS: Record<string, LeadStatus[]> = {
  NEW:             ["QUALIFIED", "LOST"],
  QUALIFIED:       ["VISIT_SCHEDULED", "NEGOTIATION", "LOST"],
  VISIT_SCHEDULED: ["NEGOTIATION", "LOST"],
  NEGOTIATION:     ["WON", "LOST"],
  WON:             [],
  LOST:            ["NEW"], // re-open a lost lead
};

export class CrmService {
  // ─── Leads ───────────────────────────────────────

  async createLead(
    organizationId: string,
    actorId: string,
    input: CreateLeadInput
  ) {
    if (input.propertyId) {
      const property = await prisma.property.findFirst({
        where: { id: input.propertyId, organizationId, isActive: true },
      });
      if (!property) throw new Error("Property not found");
    }

    // ── Duplicate check by email within org ──
    if (input.email) {
      const existing = await prisma.lead.findFirst({
        where: {
          organizationId,
          email:  input.email,
          status: { notIn: ["WON", "LOST"] },
        },
      });
      if (existing) throw new Error("An active lead with this email already exists");
    }

    const lead = await prisma.lead.create({
      data: {
        organizationId,
        name:           input.name,
        email:          input.email,
        phone:          input.phone,
        source:         input.source,
        propertyId:     input.propertyId,
        expectedBudget: input.expectedBudget,
        notes:          input.notes,
        currency:       input.currency,
        status:         "NEW",
      },
    });

    await createAuditLog({
      organizationId,
      userId:    actorId,
      action:    "CREATE",
      entity:    "Lead",
      entityId:  lead.id,
      newValues: { name: lead.name, source: lead.source },
    });

    return lead;
  }

 async getLeads(organizationId: string, query: ParsedQuery) {
  const statusFilter = query.where["status"] as string | undefined;
  const sourceFilter = query.where["source"] as string | undefined;
  const searchTerm   = query.where["search"] as string | undefined;

  console.log("Search term:", searchTerm) // debug

  const where: any = {
    organizationId,
    ...(statusFilter ? { status: statusFilter as LeadStatus } : {}),
    ...(sourceFilter ? { source: sourceFilter as any }        : {}),
    ...(searchTerm
      ? {
          OR: [
            { name:  { contains: searchTerm, mode: "insensitive" } },
            { email: { contains: searchTerm, mode: "insensitive" } },
            { phone: { contains: searchTerm, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  async getLeadById(organizationId: string, leadId: string) {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId },
      include: {
        assignedTo: {
          select: {
            id: true, firstName: true, lastName: true,
            email: true, phone: true,
          },
        },
        visits: {
          orderBy: { visitDate: "desc" },
        },
      },
    });

    if (!lead) throw new Error("Lead not found");
    return lead;
  }

  async updateLead(
    organizationId: string,
    actorId: string,
    leadId: string,
    input: UpdateLeadInput
  ) {
    const lead = await this.resolveLead(organizationId, leadId);

    if (input.email && input.email !== lead.email) {
      const duplicate = await prisma.lead.findFirst({
        where: {
          organizationId,
          email:  input.email,
          id:     { not: leadId },
          status: { notIn: ["WON", "LOST"] },
        },
      });
      if (duplicate) throw new Error("An active lead with this email already exists");
    }

    if (input.propertyId) {
      const property = await prisma.property.findFirst({
        where: { id: input.propertyId, organizationId, isActive: true },
      });
      if (!property) throw new Error("Property not found");
    }

    const updated = await prisma.lead.update({
      where: { id: leadId },
      data:  input,
    });

    await createAuditLog({
      organizationId,
      userId:    actorId,
      action:    "UPDATE",
      entity:    "Lead",
      entityId:  leadId,
      newValues: input as Record<string, unknown>,
    });

    return updated;
  }

  async updateLeadStatus(
    organizationId: string,
    actorId: string,
    leadId: string,
    input: UpdateLeadStatusInput
  ) {
    const lead = await this.resolveLead(organizationId, leadId);

    const allowedNext = ALLOWED_PIPELINE_TRANSITIONS[lead.status] ?? [];
    if (!allowedNext.includes(input.status as LeadStatus)) {
      throw new Error(
        `Cannot move lead from ${lead.status} to ${input.status}`
      );
    }

    const updated = await prisma.lead.update({
      where: { id: leadId },
      data: {
        status:  input.status as LeadStatus,
        notes:   input.notes ? `${lead.notes ?? ""}\n[${dayjs().format("DD MMM YYYY")}] ${input.notes}`.trim() : lead.notes,
        wonAt:   input.status === "WON"  ? new Date() : lead.wonAt,
        lostAt:  input.status === "LOST" ? new Date() : lead.lostAt,
      },
    });

    await createAuditLog({
      organizationId,
      userId:    actorId,
      action:    "PIPELINE_MOVE",
      entity:    "Lead",
      entityId:  leadId,
      oldValues: { status: lead.status },
      newValues: { status: input.status },
    });

    // ── Notify assigned agent via socket ──
    if (lead.assignedToId) {
      io.to(`user:${lead.assignedToId}`).emit("lead:status_updated", {
        leadId:    updated.id,
        name:      updated.name,
        oldStatus: lead.status,
        newStatus: updated.status,
      });
    }

    // ── Email agent on WON/LOST ──
    if (
      (input.status === "WON" || input.status === "LOST") &&
      lead.assignedToId
    ) {
      await this.notifyAgentOfOutcome(lead.assignedToId, updated, input.status);
    }

    return updated;
  }

  async deleteLead(
    organizationId: string,
    actorId: string,
    leadId: string
  ) {
    await this.resolveLead(organizationId, leadId);

    await prisma.lead.delete({ where: { id: leadId } });

    await createAuditLog({
      organizationId,
      userId:   actorId,
      action:   "DELETE",
      entity:   "Lead",
      entityId: leadId,
    });

    return { message: "Lead deleted successfully" };
  }

  // ─── Assignment ──────────────────────────────────

  async assignLead(
    organizationId: string,
    actorId: string,
    leadId: string,
    input: AssignLeadInput
  ) {
    await this.resolveLead(organizationId, leadId);

    const agent = await prisma.user.findFirst({
      where: {
        id:             input.agentId,
        organizationId,
        role:           "LEASING_AGENT",
        status:         "ACTIVE",
      },
    });
    if (!agent) throw new Error("Leasing agent not found in this organization");

    const updated = await prisma.lead.update({
      where: { id: leadId },
      data:  { assignedToId: input.agentId },
      include: {
        assignedTo: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    // ── Notify agent ──
    io.to(`user:${input.agentId}`).emit("lead:assigned", {
      leadId: updated.id,
      name:   updated.name,
    });

    await sendEmail({
      to:      agent.email,
      subject: "New Lead Assigned — PropFlow AI",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <h2>New Lead Assigned</h2>
          <p>Hi ${agent.firstName}, a new lead has been assigned to you.</p>
          <table style="width:100%;border-collapse:collapse;margin-top:16px;">
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Name</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">${updated.name}</td>
            </tr>
            ${updated.email
              ? `<tr>
                   <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Email</td>
                   <td style="padding:8px;border:1px solid #e5e7eb;">${updated.email}</td>
                 </tr>`
              : ""}
            ${updated.phone
              ? `<tr>
                   <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Phone</td>
                   <td style="padding:8px;border:1px solid #e5e7eb;">${updated.phone}</td>
                 </tr>`
              : ""}
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Source</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">${updated.source}</td>
            </tr>
          </table>
          <p style="margin-top:16px;">Login to PropFlow AI to manage this lead.</p>
        </div>
      `,
    });

    return updated;
  }

  // ─── Visits ──────────────────────────────────────

  async scheduleVisit(
    organizationId: string,
    actorId: string,
    leadId: string,
    input: ScheduleVisitInput
  ) {
    const lead = await this.resolveLead(organizationId, leadId);

    const property = await prisma.property.findFirst({
      where: { id: input.propertyId, organizationId, isActive: true },
    });
    if (!property) throw new Error("Property not found");

    if (input.agentId) {
      const agent = await prisma.user.findFirst({
        where: { id: input.agentId, organizationId, role: "LEASING_AGENT" },
      });
      if (!agent) throw new Error("Leasing agent not found");
    }

    const visitDate = new Date(input.visitDate);
    if (visitDate <= new Date()) throw new Error("Visit date must be in the future");

    const visit = await prisma.visit.create({
      data: {
        leadId:     leadId,
        propertyId: input.propertyId,
        agentId:    input.agentId,
        visitDate,
        notes:      input.notes,
      },
    });

    // ── Auto-advance lead to VISIT_SCHEDULED if currently NEW or QUALIFIED ──
    if (lead.status === "NEW" || lead.status === "QUALIFIED") {
      await prisma.lead.update({
        where: { id: leadId },
        data:  { status: "VISIT_SCHEDULED" },
      });
    }

    // ── Notify agent if assigned ──
    if (input.agentId) {
      const agent = await prisma.user.findUnique({ where: { id: input.agentId } });
      if (agent) {
        io.to(`user:${input.agentId}`).emit("visit:scheduled", {
          visitId:   visit.id,
          leadName:  lead.name,
          visitDate: visit.visitDate,
          property:  property.name,
        });

        await sendEmail({
          to:      agent.email,
          subject: `Visit Scheduled — ${lead.name}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
              <h2>Visit Scheduled</h2>
              <p>Hi ${agent.firstName}, a property visit has been scheduled.</p>
              <table style="width:100%;border-collapse:collapse;margin-top:16px;">
                <tr>
                  <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Lead</td>
                  <td style="padding:8px;border:1px solid #e5e7eb;">${lead.name}</td>
                </tr>
                <tr>
                  <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Property</td>
                  <td style="padding:8px;border:1px solid #e5e7eb;">${property.name}</td>
                </tr>
                <tr>
                  <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Date</td>
                  <td style="padding:8px;border:1px solid #e5e7eb;">
                    ${dayjs(visitDate).format("DD MMM YYYY hh:mm A")}
                  </td>
                </tr>
                ${input.notes
                  ? `<tr>
                       <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Notes</td>
                       <td style="padding:8px;border:1px solid #e5e7eb;">${input.notes}</td>
                     </tr>`
                  : ""}
              </table>
            </div>
          `,
        });
      }
    }

    return visit;
  }

  async markVisitCompleted(
    organizationId: string,
    visitId: string
  ) {
    const visit = await prisma.visit.findFirst({
      where: { id: visitId, lead: { organizationId } },
    });
    if (!visit) throw new Error("Visit not found");
    if (visit.isCompleted) throw new Error("Visit is already marked as completed");

    return prisma.visit.update({
      where: { id: visitId },
      data:  { isCompleted: true },
    });
  }

  async getVisitsByLead(organizationId: string, leadId: string) {
    await this.resolveLead(organizationId, leadId);

    return prisma.visit.findMany({
      where:   { leadId },
      orderBy: { visitDate: "desc" },
    });
  }

  // ─── Pipeline Analytics ──────────────────────────

  async getPipelineAnalytics(organizationId: string) {
    const [
      byStatus,
      bySource,
      conversionData,
      recentActivity,
      agentPerformance,
    ] = await Promise.all([
      // Leads by pipeline stage
      prisma.lead.groupBy({
        by:    ["status"],
        where: { organizationId },
        _count: { status: true },
      }),

      // Leads by source
      prisma.lead.groupBy({
        by:    ["source"],
        where: { organizationId },
        _count: { source: true },
      }),

      // Won vs total (conversion rate)
      prisma.lead.aggregate({
        where: { organizationId },
        _count: { id: true },
      }),

      // Last 30 days activity
      prisma.lead.findMany({
        where: {
          organizationId,
          createdAt: { gte: dayjs().subtract(30, "day").toDate() },
        },
        select:  { createdAt: true, status: true },
        orderBy: { createdAt: "asc" },
      }),

      // Per-agent performance
      prisma.lead.groupBy({
        by:    ["assignedToId", "status"],
        where: {
          organizationId,
          assignedToId: { not: null },
        },
        _count: { status: true },
      }),
    ]);

    const statusSummary = byStatus.reduce(
      (acc, item) => ({ ...acc, [item.status]: item._count.status }),
      {} as Record<string, number>
    );

    const sourceSummary = bySource.reduce(
      (acc, item) => ({ ...acc, [item.source]: item._count.source }),
      {} as Record<string, number>
    );

    const totalLeads = conversionData._count.id;
    const wonLeads   = statusSummary["WON"] ?? 0;
    const conversionRate =
      totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0;

    // Agent performance map: { agentId: { WON: n, LOST: n, ... } }
    const agentMap: Record<string, Record<string, number>> = {};
    for (const row of agentPerformance) {
      if (!row.assignedToId) continue;
      if (!agentMap[row.assignedToId]) agentMap[row.assignedToId] = {};
      agentMap[row.assignedToId][row.status] = row._count.status;
    }

    // Enrich with agent names
    const agentIds = Object.keys(agentMap);
    const agents   = agentIds.length
      ? await prisma.user.findMany({
          where:  { id: { in: agentIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];

    const agentStats = agents.map((agent) => ({
      agentId:   agent.id,
      name:      `${agent.firstName} ${agent.lastName}`,
      stats:     agentMap[agent.id] ?? {},
      wonCount:  agentMap[agent.id]?.["WON"] ?? 0,
    }));

    return {
      statusSummary,
      sourceSummary,
      totalLeads,
      conversionRate,
      agentStats,
      recentActivityCount: recentActivity.length,
    };
  }

  async getAgentLeads(
    organizationId: string,
    agentId: string,
    query: ParsedQuery
  ) {
    const agent = await prisma.user.findFirst({
      where: { id: agentId, organizationId, role: "LEASING_AGENT" },
    });
    if (!agent) throw new Error("Leasing agent not found");

    const statusFilter = query.where["status"] as string | undefined;

    const where = {
      organizationId,
      assignedToId: agentId,
      ...(statusFilter ? { status: statusFilter as LeadStatus } : {}),
    };

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        include: { _count: { select: { visits: true } } },
        orderBy: query.orderBy,
        skip:    query.skip,
        take:    query.take,
      }),
      prisma.lead.count({ where }),
    ]);

    return buildResponse(leads, total, query);
  }

  // ─── Private Helpers ─────────────────────────────

  private async resolveLead(organizationId: string, leadId: string) {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId },
    });
    if (!lead) throw new Error("Lead not found");
    return lead;
  }

  private async notifyAgentOfOutcome(
    agentId: string,
    lead: any,
    outcome: "WON" | "LOST"
  ): Promise<void> {
    const agent = await prisma.user.findUnique({ where: { id: agentId } });
    if (!agent) return;

    const isWon = outcome === "WON";

    await sendEmail({
      to:      agent.email,
      subject: `Lead ${isWon ? "Won 🎉" : "Lost"} — ${lead.name}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <h2 style="color:${isWon ? "#16a34a" : "#dc2626"};">
            Lead ${isWon ? "Won!" : "Lost"}
          </h2>
          <p>Hi ${agent.firstName}, the lead <strong>${lead.name}</strong>
             has been marked as <strong>${outcome}</strong>.</p>
          ${lead.expectedBudget
            ? `<p>Budget: <strong>${lead.expectedBudget} ${lead.currency}</strong></p>`
            : ""}
          <p>Login to PropFlow AI for details.</p>
        </div>
      `,
    });
  }
}