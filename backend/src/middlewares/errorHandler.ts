// backend/src/middlewares/errorHandler.ts
import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { logger } from "../config/logger";
import { sendError } from "../utils/response";
import { ENV } from "../config/env";

export const globalErrorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  logger.error({
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
  });

  // ─── Prisma Errors ───────────────────────────────
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002": {
        const fields = (err.meta?.target as string[])?.join(", ") ?? "field";
        sendError(res, `A record with this ${fields} already exists`, 409);
        return;
      }
      case "P2025":
        sendError(res, "Record not found", 404);
        return;
      case "P2003":
        sendError(res, "Related record not found", 404);
        return;
      case "P2014":
        sendError(res, "Invalid relation — referenced record does not exist", 400);
        return;
      default:
        sendError(res, "Database error", 500);
        return;
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    sendError(res, "Invalid data provided", 400);
    return;
  }

  // ─── Zod Errors ──────────────────────────────────
  if (err instanceof ZodError) {
    const errors = err.errors.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    }));
    sendError(res, "Validation failed", 422, errors);
    return;
  }

  // ─── Known Business Logic Errors ─────────────────
  const NOT_FOUND_MESSAGES = [
    "not found",
    "does not exist",
  ];

  const CONFLICT_MESSAGES = [
    "already exists",
    "already registered",
    "duplicate",
  ];

  const FORBIDDEN_MESSAGES = [
    "cannot delete",
    "cannot remove",
    "insufficient",
  ];

  const message = err.message?.toLowerCase() ?? "";

  if (NOT_FOUND_MESSAGES.some((m) => message.includes(m))) {
    sendError(res, err.message, 404);
    return;
  }

  if (CONFLICT_MESSAGES.some((m) => message.includes(m))) {
    sendError(res, err.message, 409);
    return;
  }

  if (FORBIDDEN_MESSAGES.some((m) => message.includes(m))) {
    sendError(res, err.message, 403);
    return;
  }

  // ─── Fallback ─────────────────────────────────────
  sendError(
    res,
    ENV.NODE_ENV === "production" ? "Internal server error" : err.message,
    500
  );
};