// backend/src/modules/auth/auth.service.ts
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "../../config/database";
import { ENV } from "../../config/env";
import { generateAccessToken, generateRefreshToken } from "../../utils/jwt";
import {
  sendEmail,
  buildVerificationEmailHtml,
  buildPasswordResetEmailHtml,
} from "../../utils/email";
import {
  RegisterInput,
  LoginInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from "./auth.schema";
import slugify from "slugify";

const BCRYPT_ROUNDS = 12;

export class AuthService {
  async register(input: RegisterInput) {
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      throw new Error("Email already registered");
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const verificationToken = crypto.randomBytes(32).toString("hex");

    let organizationId: string | null = null;

    if (input.organizationName) {
      const baseSlug = slugify(input.organizationName, { lower: true, strict: true });
      const uniqueSuffix = crypto.randomBytes(4).toString("hex");
      const slug = `${baseSlug}-${uniqueSuffix}`;

      const org = await prisma.organization.create({
        data: {
          name: input.organizationName,
          slug,
          email: input.email,
        },
      });
      organizationId = org.id;
    }

    const user = await prisma.user.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        passwordHash,
        phone: input.phone,
        role: input.organizationName ? "PROPERTY_OWNER" : "TENANT",
        organizationId,
        emailVerificationToken: verificationToken,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        organizationId: true,
      },
    });

    const verificationUrl = `${ENV.CLIENT_URL}/verify-email?token=${verificationToken}`;
    await sendEmail({
      to: user.email,
      subject: "Verify your PropFlow AI account",
      html: buildVerificationEmailHtml(user.firstName, verificationUrl),
    });

    return { user, message: "Registration successful. Please verify your email." };
  }

  async verifyEmail(token: string) {
    const user = await prisma.user.findFirst({
      where: { emailVerificationToken: token },
    });

    if (!user) throw new Error("Invalid or expired verification token");

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: new Date(),
        emailVerificationToken: null,
        status: "ACTIVE",
      },
    });

    return { message: "Email verified successfully" };
  }

  async login(input: LoginInput, ipAddress?: string) {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (!user) throw new Error("Invalid email or password");

    const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);
    if (!isPasswordValid) throw new Error("Invalid email or password");

    if (user.status === "PENDING_VERIFICATION") {
      throw new Error("Please verify your email before logging in");
    }

    if (user.status === "SUSPENDED") {
      throw new Error("Your account has been suspended");
    }

    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    const refreshTokenExpiresAt = new Date();
    refreshTokenExpiresAt.setDate(refreshTokenExpiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt: refreshTokenExpiresAt,
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
        avatar: user.avatar,
      },
    };
  }

  async refreshAccessToken(refreshToken: string) {
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      if (storedToken) {
        await prisma.refreshToken.delete({ where: { id: storedToken.id } });
      }
      throw new Error("Invalid or expired refresh token");
    }

    const tokenPayload = {
      userId: storedToken.user.id,
      email: storedToken.user.email,
      role: storedToken.user.role,
      organizationId: storedToken.user.organizationId,
    };

    const newAccessToken = generateAccessToken(tokenPayload);

    return { accessToken: newAccessToken };
  }

  async logout(refreshToken: string) {
    await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    return { message: "Logged out successfully" };
  }

  async forgotPassword(input: ForgotPasswordInput) {
    const user = await prisma.user.findUnique({ where: { email: input.email } });

    // Always return success to prevent email enumeration
    if (!user) return { message: "If this email exists, a reset link has been sent" };

    const resetToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetToken,
        passwordResetExpiresAt: expiresAt,
      },
    });

    const resetUrl = `${ENV.CLIENT_URL}/reset-password?token=${resetToken}`;
    await sendEmail({
      to: user.email,
      subject: "PropFlow AI — Password Reset",
      html: buildPasswordResetEmailHtml(user.firstName, resetUrl),
    });

    return { message: "If this email exists, a reset link has been sent" };
  }

  async resetPassword(input: ResetPasswordInput) {
    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: input.token,
        passwordResetExpiresAt: { gt: new Date() },
      },
    });

    if (!user) throw new Error("Invalid or expired reset token");

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
      },
    });

    // Invalidate all refresh tokens on password reset
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });

    return { message: "Password reset successful. Please login." };
  }

  async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        avatar: true,
        role: true,
        organizationId: true,
        emailVerifiedAt: true,
        lastLoginAt: true,
        createdAt: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            logo: true,
            subscriptionPlan: true,
          },
        },
      },
    });

    if (!user) throw new Error("User not found");
    return user;
  }
}