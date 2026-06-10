// backend/src/modules/billing/billing.schema.ts
import { z } from "zod";

export const createInvoiceSchema = z.object({
  leaseId:     z.string().uuid(),
  description: z.string().min(3).max(500),
  amount:      z.number().positive(),
  tax:         z.number().min(0).default(0),
  dueDate:     z.string().datetime(),
  currency:    z.string().default("BDT"),
});

export const createUtilityInvoiceSchema = z.object({
  leaseId:     z.string().uuid(),
  description: z.string().min(3).max(500),
  items: z.array(
    z.object({
      label:  z.string().min(1),
      amount: z.number().positive(),
    })
  ).min(1),
  tax:      z.number().min(0).default(0),
  dueDate:  z.string().datetime(),
  currency: z.string().default("BDT"),
});

export const recordCashPaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount:    z.number().positive(),
  note:      z.string().optional(),
});

export const initiateStripePaymentSchema = z.object({
  invoiceId: z.string().uuid(),
});

export const initiateSSLCommerzPaymentSchema = z.object({
  invoiceId: z.string().uuid(),
});

export type CreateInvoiceInput          = z.infer<typeof createInvoiceSchema>;
export type CreateUtilityInvoiceInput   = z.infer<typeof createUtilityInvoiceSchema>;
export type RecordCashPaymentInput      = z.infer<typeof recordCashPaymentSchema>;
export type InitiateStripePaymentInput  = z.infer<typeof initiateStripePaymentSchema>;