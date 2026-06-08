// backend/src/middlewares/authenticate.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { ENV } from "../config/env";
import { prisma } from "../config/database";
import { sendError } from "../utils/response";

interface AccessTokenPayload {
  userId: string;
  email: string;
  role: string;
  organizationId: string | null;
}

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    sendError(res, "Access token required", 401);
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, ENV.JWT_ACCESS_SECRET) as AccessTokenPayload;

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, role: true, organizationId: true, status: true },
    });

    if (!user || user.status === "SUSPENDED") {
      sendError(res, "Account not found or suspended", 401);
      return;
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    };

    next();
  } catch {
    sendError(res, "Invalid or expired access token", 401);
  }
};