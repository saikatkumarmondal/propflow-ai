// backend/src/config/env.ts
import dotenv from "dotenv";
dotenv.config();

const getRequiredEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

export const ENV = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: parseInt(process.env.PORT ?? "5000"),
  CLIENT_URL: process.env.CLIENT_URL ?? "http://localhost:5173",

  JWT_ACCESS_SECRET: getRequiredEnv("JWT_ACCESS_SECRET"),
  JWT_REFRESH_SECRET: getRequiredEnv("JWT_REFRESH_SECRET"),
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN ?? "7d",

  SMTP_HOST: process.env.SMTP_HOST ?? "smtp.gmail.com",
  SMTP_PORT: parseInt(process.env.SMTP_PORT ?? "587"),
  SMTP_USER: getRequiredEnv("SMTP_USER"),
  SMTP_PASS: getRequiredEnv("SMTP_PASS"),
  EMAIL_FROM: process.env.EMAIL_FROM ?? "PropFlow AI <noreply@propflow.ai>",

  GROQ_API_KEY: getRequiredEnv("GROQ_API_KEY"),
  GROQ_MODEL: process.env.GROQ_MODEL ?? "llama3-8b-8192",

  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME ?? "",
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY ?? "",
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET ?? "",

  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? "",
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? "",

  SSLCOMMERZ_STORE_ID: process.env.SSLCOMMERZ_STORE_ID ?? "",
  SSLCOMMERZ_STORE_PASS: process.env.SSLCOMMERZ_STORE_PASS ?? "",
  SSLCOMMERZ_IS_LIVE: process.env.SSLCOMMERZ_IS_LIVE === "true",

  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? "900000"),
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? "100"),
} as const;