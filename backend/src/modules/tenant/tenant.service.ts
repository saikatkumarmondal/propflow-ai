// backend/src/modules/tenant/tenant.service.ts
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "../../config/database";
import { sendEmail } from "../../utils/email";
import { ENV } from "../../config/env";
import { parseQuery, buildResponse, ParsedQuery } from "../../utils/queryBuilder";
import { createAuditLog } from "../../utils/auditLog";
import { CreateTenantInput, UpdateTenantInput } from "./tenant.schema";

export class TenantService {
  async createTenant(
    organizationId: string,
    actorId: string,
    input: CreateTenantInput
  ) {
    // ── If userId provided, user already exists (invited earlier) ──
    if (input.userId) {
      const user = await prisma.user.findFirst({
        where: { id: input.userId, organizationId },
      });
      if (!user) throw new Error("User not found in this organization");

      const existingTenant = await prisma.tenant.findUnique({
        where: { userId: input.userId },
      });
      if (existingTenant) throw new Error("Tenant profile already exists for this user");

      const tenant = await prisma.tenant.create({
        data: {
          userId: input.userId,
          organizationId,
          nidNumber: input.nidNumber,
          emergencyContact: input.emergencyContact,
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              role: true,
            },
          },
        },
      });

      return tenant;
    }

    // ── Create new user + tenant together ──
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
    });
    if (existingUser) throw new Error("A user with this email already exists");

    const tempPassword = crypto.randomBytes(8).toString("hex");
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const verificationToken = crypto.randomBytes(32).toString("hex");

    const user = await prisma.user.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        passwordHash,
        role: "TENANT",
        organizationId,
        emailVerificationToken: verificationToken,
        status: "PENDING_VERIFICATION",
      },
    });

    const tenant = await prisma.tenant.create({
      data: {
        userId: user.id,
        organizationId,
        nidNumber: input.nidNumber,
        emergencyContact: input.emergencyContact,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            role: true,
          },
        },
      },
    });

    const inviteUrl = `${ENV.CLIENT_URL}/accept-invite?token=${verificationToken}`;
    await sendEmail({
      to: user.email,
      subject: "Your PropFlow AI Tenant Account",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Welcome to PropFlow AI</h2>
          <p>Hi ${user.firstName}, your tenant account has been created.</p>
          <p>Temporary password: <strong>${tempPassword}</strong></p>
          <a href="${inviteUrl}"
             style="background:#2563eb;color:white;padding:12px 24px;
                    border-radius:6px;text-decoration:none;display:inline-block;">
            Activate Account
          </a>
          <p>Please change your password after first login.</p>
        </div>
      `,
    });

    await createAuditLog({
      organizationId,
      userId: actorId,
      action: "CREATE",
      entity: "Tenant",
      entityId: tenant.id,
      newValues: { email: user.email },
    });

    return tenant;
  }

  async getTenants(organizationId: string, query: ParsedQuery) {
    const where = {
      organizationId,
      user: query.where["search"]
        ? {
            OR: [
              { firstName: { contains: query.where["search"] as string, mode: "insensitive" as const } },
              { lastName:  { contains: query.where["search"] as string, mode: "insensitive" as const } },
              { email:     { contains: query.where["search"] as string, mode: "insensitive" as const } },
            ],
          }
        : undefined,
    };

    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              avatar: true,
              status: true,
            },
          },
          leases: {
            where: { status: "ACTIVE" },
            include: {
              unit: {
                select: {
                  unitNumber: true,
                  property: { select: { name: true } },
                },
              },
            },
            take: 1,
          },
          _count: { select: { leases: true } },
        },
        orderBy: { createdAt: query.orderBy["createdAt"] ?? "desc" },
        skip: query.skip,
        take: query.take,
      }),
      prisma.tenant.count({ where }),
    ]);

    return buildResponse(tenants, total, query);
  }

  async getTenantById(organizationId: string, tenantId: string) {
    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId, organizationId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            avatar: true,
            status: true,
            lastLoginAt: true,
            createdAt: true,
          },
        },
        leases: {
          orderBy: { createdAt: "desc" },
          include: {
            unit: {
              select: {
                unitNumber: true,
                unitType: true,
                rentAmount: true,
                currency: true,
                property: { select: { id: true, name: true, address: true } },
              },
            },
          },
        },
      },
    });

    if (!tenant) throw new Error("Tenant not found");
    return tenant;
  }

  async updateTenant(
    organizationId: string,
    tenantId: string,
    input: UpdateTenantInput
  ) {
    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId, organizationId },
      include: { user: true },
    });
    if (!tenant) throw new Error("Tenant not found");

    const { firstName, lastName, phone, ...tenantFields } = input;

    await Promise.all([
      (firstName || lastName || phone)
        ? prisma.user.update({
            where: { id: tenant.userId },
            data: {
              ...(firstName ? { firstName } : {}),
              ...(lastName  ? { lastName  } : {}),
              ...(phone     ? { phone     } : {}),
            },
          })
        : Promise.resolve(),

      Object.keys(tenantFields).length > 0
        ? prisma.tenant.update({ where: { id: tenantId }, data: tenantFields })
        : Promise.resolve(),
    ]);

    return prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        user: {
          select: {
            id: true, firstName: true, lastName: true,
            email: true, phone: true,
          },
        },
      },
    });
  }

  async deleteTenant(organizationId: string, tenantId: string) {
    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId, organizationId },
    });
    if (!tenant) throw new Error("Tenant not found");

    const activeLeases = await prisma.lease.count({
      where: { tenantId, status: "ACTIVE" },
    });
    if (activeLeases > 0) throw new Error("Cannot delete tenant with active lease");

    await prisma.user.update({
      where: { id: tenant.userId },
      data: { status: "INACTIVE", organizationId: null },
    });

    return { message: "Tenant removed successfully" };
  }
}