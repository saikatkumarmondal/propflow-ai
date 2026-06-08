// backend/src/modules/organization/organization.schema.ts
import { z } from "zod";

export const updateOrganizationSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  website: z.string().url().optional(),
});

export const inviteUserSchema = z.object({
  email: z.string().email(),
  role: z.enum([
    "PROPERTY_MANAGER",
    "LEASING_AGENT",
    "ACCOUNTANT",
    "MAINTENANCE_MANAGER",
    "TECHNICIAN",
    "TENANT",
  ]),
  firstName: z.string().min(2),
  lastName: z.string().min(2),
});

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export type InviteUserInput = z.infer<typeof inviteUserSchema>;