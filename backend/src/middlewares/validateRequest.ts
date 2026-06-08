// backend/src/middlewares/validateRequest.ts
import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";
import { sendError } from "../utils/response";

export const validateRequest = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const issues = result.error.issues ?? result.error.errors ?? []
      const errors = issues.map((e: any) => ({
        field: e.path.join("."),
        message: e.message,
      }));
      sendError(res, "Validation failed", 422, errors);
      return;
    }

    req.body = result.data;
    next();
  };
};