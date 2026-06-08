// backend/src/config/logger.ts
import winston from "winston";
import { ENV } from "./env";

export const logger = winston.createLogger({
  level: ENV.NODE_ENV === "production" ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    ENV.NODE_ENV === "production"
      ? winston.format.json()
      : winston.format.colorize(),
    ENV.NODE_ENV !== "production"
      ? winston.format.printf(({ timestamp, level, message, stack }) =>
          `${timestamp} [${level}]: ${stack ?? message}`
        )
      : winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    ...(ENV.NODE_ENV === "production"
      ? [
          new winston.transports.File({ filename: "logs/error.log", level: "error" }),
          new winston.transports.File({ filename: "logs/combined.log" }),
        ]
      : []),
  ],
});