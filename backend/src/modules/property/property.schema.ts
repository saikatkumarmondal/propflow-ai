// backend/src/modules/property/property.schema.ts
import { z } from "zod";
import { PropertyType } from "@prisma/client";

export const createPropertySchema = z.object({
  name: z.string().min(2).max(150),
  type: z.nativeEnum(PropertyType).default("RESIDENTIAL"),
  address: z.string().min(5),
  city: z.string().min(2),
  state: z.string().optional(),
  country: z.string().default("Bangladesh"),
  postalCode: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  description: z.string().optional(),
});

export const updatePropertySchema = createPropertySchema.partial();

export const createBuildingSchema = z.object({
  name: z.string().min(1).max(100),
  totalFloors: z.number().int().min(1).default(1),
});

export const updateBuildingSchema = createBuildingSchema.partial();

export const createFloorSchema = z.object({
  floorNumber: z.number().int(),
  name: z.string().optional(),
});

export const updateFloorSchema = createFloorSchema.partial();

export const createUnitSchema = z.object({
  unitNumber: z.string().min(1).max(20),
  floorId: z.string().uuid().optional(),
  unitType: z.string().optional(),
  sizeSqft: z.number().positive().optional(),
  bedrooms: z.number().int().min(0).optional(),
  bathrooms: z.number().int().min(0).optional(),
  rentAmount: z.number().positive(),
  currency: z.string().default("BDT"),
  amenities: z.array(z.string()).default([]),
});

export const updateUnitSchema = createUnitSchema.partial();

export type CreatePropertyInput = z.infer<typeof createPropertySchema>;
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;
export type CreateBuildingInput = z.infer<typeof createBuildingSchema>;
export type CreateFloorInput = z.infer<typeof createFloorSchema>;
export type CreateUnitInput = z.infer<typeof createUnitSchema>;
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;