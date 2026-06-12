// backend/src/modules/maintenance/maintenance.schema.ts
import { z } from "zod";

export const createMaintenanceRequestSchema = z.object({
  unitId:      z.string().uuid(),
  title:       z.string().min(5).max(200),
  description: z.string().min(10).max(1000),
  priority:    z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
});

export const assignTechnicianSchema = z.object({
  technicianId: z.string().uuid(),
  scheduledAt:  z.string().datetime().optional(),
  notes:        z.string().max(500).optional(),
});

export const updateMaintenanceStatusSchema = z.object({
  status:           z.enum(["IN_PROGRESS", "COMPLETED", "CANCELLED"]),
  completionNotes:  z.string().max(1000).optional(),
});

export const addCompletionNotesSchema = z.object({
  completionNotes:  z.string().min(5).max(1000),
  completionImages: z.array(z.string().url()).default([]),
});

export type CreateMaintenanceRequestInput = z.infer<typeof createMaintenanceRequestSchema>;
export type AssignTechnicianInput         = z.infer<typeof assignTechnicianSchema>;
export type UpdateMaintenanceStatusInput  = z.infer<typeof updateMaintenanceStatusSchema>;
export type AddCompletionNotesInput       = z.infer<typeof addCompletionNotesSchema>;