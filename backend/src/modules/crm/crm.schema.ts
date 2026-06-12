// backend/src/modules/crm/crm.schema.ts
import { z } from "zod";

export const createLeadSchema = z.object({
  name:           z.string().min(2).max(100),
  email:          z.string().email().optional(),
  phone:          z.string().optional(),
  source:         z.enum(["WEBSITE", "REFERRAL", "WALK_IN", "SOCIAL_MEDIA", "AGENT", "OTHER"]).default("OTHER"),
  propertyId:     z.string().uuid().optional(),
  expectedBudget: z.number().positive().optional(),
  notes:          z.string().max(1000).optional(),
  currency:       z.string().default("BDT"),
});

export const updateLeadSchema = z.object({
  name:           z.string().min(2).max(100).optional(),
  email:          z.string().email().optional(),
  phone:          z.string().optional(),
  source:         z.enum(["WEBSITE", "REFERRAL", "WALK_IN", "SOCIAL_MEDIA", "AGENT", "OTHER"]).optional(),
  propertyId:     z.string().uuid().optional(),
  expectedBudget: z.number().positive().optional(),
  notes:          z.string().max(1000).optional(),
  currency:       z.string().optional(),
});

export const updateLeadStatusSchema = z.object({
  status: z.enum(["NEW", "QUALIFIED", "VISIT_SCHEDULED", "NEGOTIATION", "WON", "LOST"]),
  notes:  z.string().max(500).optional(),
});

export const scheduleVisitSchema = z.object({
  visitDate:  z.string().datetime(),
  propertyId: z.string().uuid(),
  agentId:    z.string().uuid().optional(),
  notes:      z.string().max(500).optional(),
});

export const assignLeadSchema = z.object({
  agentId: z.string().uuid(),
});

export type CreateLeadInput       = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput       = z.infer<typeof updateLeadSchema>;
export type UpdateLeadStatusInput = z.infer<typeof updateLeadStatusSchema>;
export type ScheduleVisitInput    = z.infer<typeof scheduleVisitSchema>;
export type AssignLeadInput       = z.infer<typeof assignLeadSchema>;