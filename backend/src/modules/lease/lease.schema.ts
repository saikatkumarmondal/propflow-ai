// backend/src/modules/lease/lease.schema.ts
import { z } from "zod";

export const createLeaseSchema = z.object({
  tenantId: z.string().uuid(),
  unitId:   z.string().uuid(),
  startDate: z.string().datetime(),
  endDate:   z.string().datetime(),
  rentAmount: z.number().positive(),
  securityDeposit: z.number().min(0),
  terms: z.string().optional(),
}).refine(
  (data) => new Date(data.endDate) > new Date(data.startDate),
  { message: "End date must be after start date", path: ["endDate"] }
);

export const renewLeaseSchema = z.object({
  newEndDate: z.string().datetime(),
  rentAmount: z.number().positive().optional(),
}).refine(
  (data) => new Date(data.newEndDate) > new Date(),
  { message: "New end date must be in the future", path: ["newEndDate"] }
);

export const terminateLeaseSchema = z.object({
  reason: z.string().min(5).max(500),
});

export type CreateLeaseInput    = z.infer<typeof createLeaseSchema>;
export type RenewLeaseInput     = z.infer<typeof renewLeaseSchema>;
export type TerminateLeaseInput = z.infer<typeof terminateLeaseSchema>;