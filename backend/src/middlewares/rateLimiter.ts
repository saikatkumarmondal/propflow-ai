// backend/src/middlewares/rateLimiter.ts
import rateLimit from "express-rate-limit";
import { ENV } from "../config/env";
import { sendError } from "../utils/response";

export const globalRateLimiter = rateLimit({
  windowMs: ENV.RATE_LIMIT_WINDOW_MS,
  max: ENV.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    sendError(res, "Too many requests. Please try again later.", 429);
  },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  handler: (req, res) => {
    sendError(res, "Too many authentication attempts. Try again in 15 minutes.", 429);
  },
});