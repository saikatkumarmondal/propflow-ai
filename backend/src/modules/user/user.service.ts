// backend/src/modules/user/user.service.ts
import bcrypt from "bcryptjs";
import { prisma } from "../../config/database";
import { UpdateProfileInput, ChangePasswordInput } from "./user.schema";

const BCRYPT_ROUNDS = 12;

export class UserService {
  async updateProfile(userId: string, input: UpdateProfileInput) {
    return prisma.user.update({
      where: { id: userId },
      data: input,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        avatar: true,
        role: true,
      },
    });
  }

  async changePassword(userId: string, input: ChangePasswordInput) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    const isCurrentPasswordValid = await bcrypt.compare(
      input.currentPassword,
      user.passwordHash
    );
    if (!isCurrentPasswordValid) throw new Error("Current password is incorrect");

    const newPasswordHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    // Invalidate all refresh tokens on password change
    await prisma.refreshToken.deleteMany({ where: { userId } });

    return { message: "Password changed successfully. Please login again." };
  }

  async getUserById(userId: string, organizationId: string) {
    const user = await prisma.user.findFirst({
      where: { id: userId, organizationId },
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
    });

    if (!user) throw new Error("User not found");
    return user;
  }

  async getDashboardStats(userId: string, organizationId: string, role: string) {
    const baseWhere = { organizationId };

    if (role === "PROPERTY_OWNER" || role === "PROPERTY_MANAGER") {
      const [totalProperties, totalUnits, vacancySummary, overdueInvoices, openMaintenance] =
        await Promise.all([
          prisma.property.count({ where: { ...baseWhere, isActive: true } }),
          prisma.unit.count({ where: { property: { organizationId } } }),
          prisma.unit.groupBy({
            by: ["status"],
            where: { property: { organizationId } },
            _count: true,
          }),
          prisma.invoice.count({
            where: { organizationId, status: "OVERDUE" },
          }),
          prisma.maintenanceRequest.count({
            where: { organizationId, status: "OPEN" },
          }),
        ]);

      const occupied = vacancySummary.find((v) => v.status === "OCCUPIED")?._count ?? 0;
      const total = vacancySummary.reduce((acc, v) => acc + v._count, 0);

      return {
        totalProperties,
        totalUnits,
        occupancyRate: total > 0 ? Math.round((occupied / total) * 100) : 0,
        overdueInvoices,
        openMaintenance,
      };
    }

    if (role === "TENANT") {
      const tenant = await prisma.tenant.findFirst({
        where: { userId },
        include: {
          leases: {
            where: { status: "ACTIVE" },
            include: {
              unit: { select: { unitNumber: true, rentAmount: true, currency: true } },
              invoices: { where: { status: { in: ["PENDING", "OVERDUE"] } }, take: 3 },
            },
            take: 1,
          },
        },
      });

      return { tenant };
    }

    return {};
  }
}