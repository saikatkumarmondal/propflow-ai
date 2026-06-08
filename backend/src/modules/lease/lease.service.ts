// backend/src/modules/lease/lease.service.ts
import dayjs from "dayjs";
import { prisma } from "../../config/database";
import { createAuditLog } from "../../utils/auditLog";
import { sendEmail } from "../../utils/email";
import { buildResponse, ParsedQuery } from "../../utils/queryBuilder";
import {
  CreateLeaseInput,
  RenewLeaseInput,
  TerminateLeaseInput,
} from "./lease.schema";

const EXPIRY_ALERT_DAYS_BEFORE = 30;

export class LeaseService {
  async createLease(
    organizationId: string,
    actorId: string,
    input: CreateLeaseInput
  ) {
    // ── Validate tenant belongs to org ──
    const tenant = await prisma.tenant.findFirst({
      where: { id: input.tenantId, organizationId },
      include: { user: true },
    });
    if (!tenant) throw new Error("Tenant not found in this organization");

    // ── Validate unit belongs to org ──
    const unit = await prisma.unit.findFirst({
      where: { id: input.unitId, property: { organizationId } },
      include: { property: true },
    });
    if (!unit) throw new Error("Unit not found in this organization");

    // ── Unit must be vacant ──
    if (unit.status !== "VACANT") {
      throw new Error(`Unit is not available. Current status: ${unit.status}`);
    }

    // ── No overlapping active lease on this unit ──
    const overlappingLease = await prisma.lease.findFirst({
      where: {
        unitId: input.unitId,
        status: "ACTIVE",
        OR: [
          {
            startDate: { lte: new Date(input.endDate) },
            endDate:   { gte: new Date(input.startDate) },
          },
        ],
      },
    });
    if (overlappingLease) throw new Error("Unit already has an active lease for this period");

    const [lease] = await prisma.$transaction([
      prisma.lease.create({
        data: {
          tenantId:        input.tenantId,
          unitId:          input.unitId,
          startDate:       new Date(input.startDate),
          endDate:         new Date(input.endDate),
          rentAmount:      input.rentAmount,
          securityDeposit: input.securityDeposit,
          terms:           input.terms,
          status:          "ACTIVE",
        },
        include: {
          tenant: {
            include: {
              user: { select: { firstName: true, lastName: true, email: true } },
            },
          },
          unit: {
            select: {
              unitNumber: true,
              property: { select: { name: true, address: true } },
            },
          },
        },
      }),
      prisma.unit.update({
        where: { id: input.unitId },
        data:  { status: "OCCUPIED" },
      }),
    ]);

    await createAuditLog({
      organizationId,
      userId:   actorId,
      action:   "CREATE",
      entity:   "Lease",
      entityId: lease.id,
      newValues: {
        tenantId: input.tenantId,
        unitId:   input.unitId,
        startDate: input.startDate,
        endDate:   input.endDate,
      },
    });

    // ── Send lease confirmation email ──
    await sendEmail({
      to: lease.tenant.user.email,
      subject: "Lease Agreement Confirmed — PropFlow AI",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <h2>Lease Confirmed</h2>
          <p>Hi ${lease.tenant.user.firstName},</p>
          <p>Your lease for <strong>Unit ${lease.unit.unitNumber}</strong>
             at <strong>${lease.unit.property.name}</strong> has been confirmed.</p>
          <table style="width:100%;border-collapse:collapse;margin-top:16px;">
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Start Date</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">${dayjs(lease.startDate).format("DD MMM YYYY")}</td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">End Date</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">${dayjs(lease.endDate).format("DD MMM YYYY")}</td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Monthly Rent</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">${lease.rentAmount} BDT</td>
            </tr>
          </table>
          <p style="margin-top:16px;">Please login to PropFlow AI to view your full lease agreement.</p>
        </div>
      `,
    });

    return lease;
  }

  async getLeases(organizationId: string, query: ParsedQuery) {
    const statusFilter = query.where["status"] as string | undefined;

    const where = {
      tenant: { organizationId },
      ...(statusFilter ? { status: statusFilter as any } : {}),
    };

    const [leases, total] = await Promise.all([
      prisma.lease.findMany({
        where,
        include: {
          tenant: {
            include: {
              user: {
                select: {
                  firstName: true, lastName: true,
                  email: true, phone: true,
                },
              },
            },
          },
          unit: {
            select: {
              unitNumber: true,
              property: { select: { id: true, name: true } },
            },
          },
          _count: { select: { invoices: true } },
        },
        orderBy: query.orderBy,
        skip:    query.skip,
        take:    query.take,
      }),
      prisma.lease.count({ where }),
    ]);

    return buildResponse(leases, total, query);
  }

  async getLeaseById(organizationId: string, leaseId: string) {
    const lease = await prisma.lease.findFirst({
      where: { id: leaseId, tenant: { organizationId } },
      include: {
        tenant: {
          include: {
            user: {
              select: {
                id: true, firstName: true, lastName: true,
                email: true, phone: true, avatar: true,
              },
            },
          },
        },
        unit: {
          include: {
            property: { select: { id: true, name: true, address: true } },
            floor:    { select: { floorNumber: true, name: true } },
          },
        },
        invoices: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!lease) throw new Error("Lease not found");
    return lease;
  }

  async renewLease(
    organizationId: string,
    actorId: string,
    leaseId: string,
    input: RenewLeaseInput
  ) {
    const lease = await prisma.lease.findFirst({
      where: { id: leaseId, tenant: { organizationId } },
      include: {
        tenant: {
          include: {
            user: { select: { firstName: true, email: true } },
          },
        },
        unit: { select: { unitNumber: true } },
      },
    });

    if (!lease) throw new Error("Lease not found");
    if (lease.status === "TERMINATED") throw new Error("Cannot renew a terminated lease");

    const newEndDate = new Date(input.newEndDate);
    if (newEndDate <= lease.endDate) {
      throw new Error("New end date must be after the current end date");
    }

    const updated = await prisma.lease.update({
      where: { id: leaseId },
      data: {
        endDate:    newEndDate,
        rentAmount: input.rentAmount ?? lease.rentAmount,
        status:     "ACTIVE",
      },
    });

    await createAuditLog({
      organizationId,
      userId:   actorId,
      action:   "RENEW",
      entity:   "Lease",
      entityId: leaseId,
      oldValues: { endDate: lease.endDate, rentAmount: Number(lease.rentAmount) },
      newValues: { endDate: newEndDate,     rentAmount: input.rentAmount },
    });

    await sendEmail({
      to: lease.tenant.user.email,
      subject: "Lease Renewed — PropFlow AI",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <h2>Lease Renewed</h2>
          <p>Hi ${lease.tenant.user.firstName}, your lease for Unit
             <strong>${lease.unit.unitNumber}</strong> has been renewed.</p>
          <p>New end date: <strong>${dayjs(newEndDate).format("DD MMM YYYY")}</strong></p>
          ${input.rentAmount ? `<p>Updated rent: <strong>${input.rentAmount} BDT</strong></p>` : ""}
        </div>
      `,
    });

    return updated;
  }

  async terminateLease(
    organizationId: string,
    actorId: string,
    leaseId: string,
    input: TerminateLeaseInput
  ) {
    const lease = await prisma.lease.findFirst({
      where: { id: leaseId, tenant: { organizationId } },
      include: {
        tenant: {
          include: {
            user: { select: { firstName: true, email: true } },
          },
        },
        unit: { select: { unitNumber: true } },
      },
    });

    if (!lease) throw new Error("Lease not found");
    if (lease.status === "TERMINATED") throw new Error("Lease is already terminated");

    await prisma.$transaction([
      prisma.lease.update({
        where: { id: leaseId },
        data:  { status: "TERMINATED" },
      }),
      prisma.unit.update({
        where: { id: lease.unitId },
        data:  { status: "VACANT" },
      }),
    ]);

    await createAuditLog({
      organizationId,
      userId:   actorId,
      action:   "TERMINATE",
      entity:   "Lease",
      entityId: leaseId,
      newValues: { reason: input.reason },
    });

    await sendEmail({
      to: lease.tenant.user.email,
      subject: "Lease Terminated — PropFlow AI",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <h2>Lease Terminated</h2>
          <p>Hi ${lease.tenant.user.firstName}, your lease for Unit
             <strong>${lease.unit.unitNumber}</strong> has been terminated.</p>
          <p><strong>Reason:</strong> ${input.reason}</p>
          <p>Please contact your property manager for further details.</p>
        </div>
      `,
    });

    return { message: "Lease terminated successfully" };
  }

  async getExpiringLeases(organizationId: string) {
    const alertThreshold = dayjs().add(EXPIRY_ALERT_DAYS_BEFORE, "day").toDate();

    return prisma.lease.findMany({
      where: {
        tenant: { organizationId },
        status:  "ACTIVE",
        endDate: { lte: alertThreshold, gte: new Date() },
      },
      include: {
        tenant: {
          include: {
            user: { select: { firstName: true, lastName: true, email: true } },
          },
        },
        unit: {
          select: {
            unitNumber: true,
            property: { select: { name: true } },
          },
        },
      },
      orderBy: { endDate: "asc" },
    });
  }

  // ── Called by cron job ──
  async processLeaseExpiryAlerts(): Promise<void> {
    const expiringLeases = await this.getExpiringLeases(""); // will filter below

    const allExpiringLeases = await prisma.lease.findMany({
      where: {
        status:  "ACTIVE",
        endDate: {
          lte: dayjs().add(EXPIRY_ALERT_DAYS_BEFORE, "day").toDate(),
          gte: new Date(),
        },
      },
      include: {
        tenant: {
          include: {
            user: { select: { firstName: true, email: true } },
            organization: { select: { name: true } },
          },
        },
        unit: {
          select: {
            unitNumber: true,
            property: { select: { name: true } },
          },
        },
      },
    });

    for (const lease of allExpiringLeases) {
      const daysLeft = dayjs(lease.endDate).diff(dayjs(), "day");

      await sendEmail({
        to: lease.tenant.user.email,
        subject: `Lease Expiring in ${daysLeft} Days — PropFlow AI`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <h2>Lease Expiry Reminder</h2>
            <p>Hi ${lease.tenant.user.firstName},</p>
            <p>Your lease for <strong>Unit ${lease.unit.unitNumber}</strong>
               at <strong>${lease.unit.property.name}</strong>
               expires in <strong>${daysLeft} days</strong>
               on <strong>${dayjs(lease.endDate).format("DD MMM YYYY")}</strong>.</p>
            <p>Please contact your property manager to discuss renewal.</p>
          </div>
        `,
      });
    }

    // ── Auto-expire overdue leases ──
    await prisma.lease.updateMany({
      where: {
        status:  "ACTIVE",
        endDate: { lt: new Date() },
      },
      data: { status: "EXPIRED" },
    });
  }
}