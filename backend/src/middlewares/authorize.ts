// backend/src/middlewares/authorize.ts
import { Request, Response, NextFunction } from "express";
import { UserRole } from "@prisma/client";
import { sendError } from "../utils/response";

export const authorize = (...allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, "Unauthorized", 401);
      return;
    }

    if (!allowedRoles.includes(req.user.role as UserRole)) {
      sendError(res, "Insufficient permissions", 403);
      return;
    }

    next();
  };
};
