// backend/src/app.ts
require("dotenv").config()

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { createServer } from "http";
import { Server } from "socket.io";

import { ENV } from "./config/env";
import { logger } from "./config/logger";
import { globalRateLimiter } from "./middlewares/rateLimiter";
import { sendError } from "./utils/response";

import authRoutes from "./modules/auth/auth.routes";
import organizationRoutes from "./modules/organization/organization.routes";
import propertyRoutes from "./modules/property/property.routes";
import userRoutes from "./modules/user/user.routes";
const app = express();
const httpServer = createServer(app);

// ─── Socket.IO ────────────────────────────────────
export const io = new Server(httpServer, {
  cors: {
    origin: ENV.CLIENT_URL,
    methods: ["GET", "POST"],
  },
});

// ─── Global Middlewares ───────────────────────────
app.use(helmet());
app.use(cors({ origin: ENV.CLIENT_URL, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(ENV.NODE_ENV === "production" ? "combined" : "dev"));
app.use(globalRateLimiter);

// ─── Health Check ─────────────────────────────────
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "PropFlow AI API",
    timestamp: new Date().toISOString(),
    environment: ENV.NODE_ENV,
  });
});

// ─── API Routes ───────────────────────────────────
const API_PREFIX = "/api/v1";
app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/organizations`, organizationRoutes);

app.use(`${API_PREFIX}/properties`, propertyRoutes);
app.use(`${API_PREFIX}/users`, userRoutes);

// ─── 404 Handler ──────────────────────────────────
app.use((req: Request, res: Response) => {
  sendError(res, `Route ${req.originalUrl} not found`, 404);
});

// ─── Global Error Handler (Express 5) ────────────
// Express 5 automatically catches async errors — no need for express-async-errors
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(err.stack);
  const status = (err as any).status || (err as any).statusCode || 500;
  sendError(
    res,
    ENV.NODE_ENV === "production" ? "Internal server error" : err.message,
    status
  );
});

// ─── Socket.IO Events ─────────────────────────────
io.on("connection", (socket) => {
  logger.info(`Socket connected: ${socket.id}`);

  socket.on("join:organization", (organizationId: string) => {
    socket.join(`org:${organizationId}`);
  });

  socket.on("join:user", (userId: string) => {
    socket.join(`user:${userId}`);
  });

  socket.on("disconnect", () => {
    logger.info(`Socket disconnected: ${socket.id}`);
  });
});

// ─── Start Server ─────────────────────────────────
httpServer.listen(ENV.PORT, () => {
  logger.info(`🚀 PropFlow AI server running on port ${ENV.PORT} [${ENV.NODE_ENV}]`);
});

export default app;