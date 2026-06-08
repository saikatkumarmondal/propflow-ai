// backend/src/utils/auditLog.ts
import { prisma } from "../config/database";

interface CreateAuditLogParams {
  organizationId?: string;
  userId?: string;
  action: string;
  entity: string;
  entityId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export const createAuditLog = async (params: CreateAuditLogParams): Promise<void> => {
  await prisma.auditLog.create({ data: params });
};