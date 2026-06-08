// backend/src/utils/jwt.ts
import jwt from "jsonwebtoken";
import { ENV } from "../config/env";
import { UserRole } from "@prisma/client";

interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  organizationId: string | null;
}

export const generateAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, ENV.JWT_ACCESS_SECRET, {
    expiresIn: ENV.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
};

export const generateRefreshToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, ENV.JWT_REFRESH_SECRET, {
    expiresIn: ENV.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
};