// backend/src/modules/auth/auth.controller.ts
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { sendSuccess, sendError } from "../../utils/response";
import { logger } from "../../config/logger";

const authService = new AuthService();

export class AuthController {
  async register(req: Request, res: Response): Promise<void> {
    try {
      const result = await authService.register(req.body);
      sendSuccess(res, result, "Registration successful", 201);
    } catch (error) {
      logger.error("REGISTER ERROR:", error);
      console.error("REGISTER ERROR:", error);
      const message = error instanceof Error ? error.message : "Registration failed";
      sendError(res, message, message === "Email already registered" ? 409 : 500);
    }
  }

  async verifyEmail(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.query as { token: string };
      const result = await authService.verifyEmail(token);
      sendSuccess(res, result);
    } catch (error) {
      logger.error("VERIFY EMAIL ERROR:", error);
      const message = error instanceof Error ? error.message : "Verification failed";
      sendError(res, message, 400);
    }
  }

  async login(req: Request, res: Response): Promise<void> {
    try {
      const ipAddress = req.ip;
      const result = await authService.login(req.body, ipAddress);
      sendSuccess(res, result, "Login successful");
    } catch (error) {
      logger.error("LOGIN ERROR:", error);
      const message = error instanceof Error ? error.message : "Login failed";
      sendError(res, message, 401);
    }
  }

  async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      const result = await authService.refreshAccessToken(req.body.refreshToken);
      sendSuccess(res, result);
    } catch (error) {
      logger.error("REFRESH TOKEN ERROR:", error);
      const message = error instanceof Error ? error.message : "Token refresh failed";
      sendError(res, message, 401);
    }
  }

  async logout(req: Request, res: Response): Promise<void> {
    try {
      const result = await authService.logout(req.body.refreshToken);
      sendSuccess(res, result);
    } catch (error) {
      logger.error("LOGOUT ERROR:", error);
      sendError(res, "Logout failed");
    }
  }

  async forgotPassword(req: Request, res: Response): Promise<void> {
    try {
      const result = await authService.forgotPassword(req.body);
      sendSuccess(res, result);
    } catch (error) {
      logger.error("FORGOT PASSWORD ERROR:", error);
      sendError(res, "Failed to process request");
    }
  }

  async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      const result = await authService.resetPassword(req.body);
      sendSuccess(res, result);
    } catch (error) {
      logger.error("RESET PASSWORD ERROR:", error);
      const message = error instanceof Error ? error.message : "Reset failed";
      sendError(res, message, 400);
    }
  }

  async getMe(req: Request, res: Response): Promise<void> {
    try {
      const result = await authService.getMe(req.user!.id);
      sendSuccess(res, result);
    } catch (error) {
      logger.error("GET ME ERROR:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch profile";
      sendError(res, message, 404);
    }
  }
}