// backend/src/modules/tenant/tenant.schema.ts
import { z } from "zod";

const emergencyContactSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  relation: z.string().min(1),
}).optional();

export const createTenantSchema = z.object({
  userId: z.string().uuid().optional(),
  firstName: z.string().min(2).max(50).optional(),
  lastName: z.string().min(2).max(50).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  nidNumber: z.string().optional(),
  emergencyContact: emergencyContactSchema,
});

export const updateTenantSchema = z.object({
  firstName: z.string().min(2).max(50).optional(),
  lastName: z.string().min(2).max(50).optional(),
  phone: z.string().optional(),
  nidNumber: z.string().optional(),
  emergencyContact: emergencyContactSchema,
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;