// backend/src/modules/tenant/tenant.schema.ts
import { z } from "zod";

export const createTenantSchema = z.object({
  userId: z.string().uuid().optional(),
  firstName: z.string().min(2).max(50),
  lastName: z.string().min(2).max(50),
  email: z.string().email(),
  phone: z.string().optional(),
  nidNumber: z.string().optional(),
  emergencyContact: z.string().optional(),
});

export const updateTenantSchema = z.object({
  firstName: z.string().min(2).max(50).optional(),
  lastName: z.string().min(2).max(50).optional(),
  phone: z.string().optional(),
  nidNumber: z.string().optional(),
  emergencyContact: z.string().optional(),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;