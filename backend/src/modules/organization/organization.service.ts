// backend/src/modules/organization/organization.service.ts
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "../../config/database";
import { sendEmail } from "../../utils/email";
import { ENV } from "../../config/env";
import { UpdateOrganizationInput, InviteUserInput } from "./organization.schema";
import { UserRole } from "@prisma/client";

export class OrganizationService {
  async getOrganization(organizationId: string) {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        _count: {
          select: {
            users: true,
            properties: true,
            tenants: true,
          },
        },
      },
    });

    if (!org) throw new Error("Organization not found");
    return org;
  }

  async updateOrganization(organizationId: string, input: UpdateOrganizationInput) {
    const org = await prisma.organization.update({
      where: { id: organizationId },
      data: input,
    });
    return org;
  }

  async getOrganizationMembers(organizationId: string) {
    return prisma.user.findMany({
      where: { organizationId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        avatar: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async inviteUser(organizationId: string, input: InviteUserInput) {
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
        passwordHash,
        role: input.role as UserRole,
        organizationId,
        emailVerificationToken: verificationToken,
        status: "PENDING_VERIFICATION",
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
      },
    });

    const inviteUrl = `${ENV.CLIENT_URL}/accept-invite?token=${verificationToken}`;
    await sendEmail({
      to: user.email,
      subject: "You've been invited to PropFlow AI",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>You've been invited!</h2>
          <p>Hi ${user.firstName}, you've been added to PropFlow AI as <strong>${user.role.replace("_", " ")}</strong>.</p>
          <p>Your temporary password: <strong>${tempPassword}</strong></p>
          <a href="${inviteUrl}" 
             style="background: #2563eb; color: white; padding: 12px 24px; 
                    border-radius: 6px; text-decoration: none; display: inline-block;">
            Accept Invitation
          </a>
          <p>Please change your password after first login.</p>
        </div>
      `,
    });

    return { user, message: "Invitation sent successfully" };
  }

  async removeMember(organizationId: string, targetUserId: string) {
    const user = await prisma.user.findFirst({
      where: { id: targetUserId, organizationId },
    });

    if (!user) throw new Error("Member not found in organization");
    if (user.role === "PROPERTY_OWNER") throw new Error("Cannot remove property owner");

    await prisma.user.update({
      where: { id: targetUserId },
      data: { organizationId: null, status: "INACTIVE" },
    });

    return { message: "Member removed successfully" };
  }

  async updateMemberRole(
    organizationId: string,
    targetUserId: string,
    newRole: UserRole
  ) {
    const user = await prisma.user.findFirst({
      where: { id: targetUserId, organizationId },
    });

    if (!user) throw new Error("Member not found");

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: { role: newRole },
      select: { id: true, firstName: true, lastName: true, email: true, role: true },
    });

    return updated;
  }
}