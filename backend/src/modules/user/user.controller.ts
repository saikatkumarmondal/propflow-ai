// backend/src/modules/user/user.controller.ts
import { Request, Response } from "express";
import { UserService } from "./user.service";
import { sendSuccess } from "../../utils/response";

const userService = new UserService();

export class UserController {
  async updateProfile(req: Request, res: Response): Promise<void> {
    const result = await userService.updateProfile(req.user!.id, req.body);
    sendSuccess(res, result, "Profile updated");
  }

  async changePassword(req: Request, res: Response): Promise<void> {
    const result = await userService.changePassword(req.user!.id, req.body);
    sendSuccess(res, result);
  }

  async getUserById(req: Request, res: Response): Promise<void> {
    const result = await userService.getUserById(
      req.params.userId,
      req.user!.organizationId!
    );
    sendSuccess(res, result);
  }

  async getDashboardStats(req: Request, res: Response): Promise<void> {
    const result = await userService.getDashboardStats(
      req.user!.id,
      req.user!.organizationId!,
      req.user!.role
    );
    sendSuccess(res, result);
  }
}