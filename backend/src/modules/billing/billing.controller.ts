// backend/src/modules/billing/billing.controller.ts
import { Request, Response } from "express";
import { BillingService } from "./billing.service";
import { sendSuccess, sendError } from "../../utils/response";
import { parseQuery } from "../../utils/queryBuilder";

const billingService = new BillingService();

const INVOICE_QUERY_OPTIONS = {
  allowedFilters:    ["status", "currency"],
  allowedSortFields: ["dueDate", "totalAmount", "createdAt", "paidAt"],
  defaultSortField:  "createdAt",
  searchFields:      ["invoiceNumber", "description"],
} as const;

export class BillingController {
  // ─── Invoices ────────────────────────────────────

  async createRentInvoice(req: Request, res: Response): Promise<void> {
    const result = await billingService.createRentInvoice(
      req.user!.organizationId!,
      req.user!.id,
      req.body
    );
    sendSuccess(res, result, "Rent invoice created", 201);
  }

  async createUtilityInvoice(req: Request, res: Response): Promise<void> {
    const result = await billingService.createUtilityInvoice(
      req.user!.organizationId!,
      req.user!.id,
      req.body
    );
    sendSuccess(res, result, "Utility invoice created", 201);
  }

  async getInvoices(req: Request, res: Response): Promise<void> {
    const query  = parseQuery(req, INVOICE_QUERY_OPTIONS);
    const result = await billingService.getInvoices(req.user!.organizationId!, query);
    sendSuccess(res, result);
  }

  async getInvoiceById(req: Request, res: Response): Promise<void> {
    const result = await billingService.getInvoiceById(
      req.user!.organizationId!,
      req.params.invoiceId
    );
    sendSuccess(res, result);
  }

  async getOverdueSummary(req: Request, res: Response): Promise<void> {
    const result = await billingService.getOverdueSummary(req.user!.organizationId!);
    sendSuccess(res, result);
  }

  // ─── Payments ────────────────────────────────────

  async recordCashPayment(req: Request, res: Response): Promise<void> {
    const result = await billingService.recordCashPayment(
      req.user!.organizationId!,
      req.user!.id,
      req.body
    );
    sendSuccess(res, result, "Cash payment recorded");
  }

  async initiateStripePayment(req: Request, res: Response): Promise<void> {
    const result = await billingService.initiateStripePayment(
      req.user!.organizationId!,
      req.body.invoiceId
    );
    sendSuccess(res, result);
  }

  async initiateSSLCommerzPayment(req: Request, res: Response): Promise<void> {
    const result = await billingService.initiateSSLCommerzPayment(
      req.user!.organizationId!,
      req.body.invoiceId
    );
    sendSuccess(res, result);
  }

  async stripeWebhook(req: Request, res: Response): Promise<void> {
    const signature = req.headers["stripe-signature"] as string;
    if (!signature) {
      sendError(res, "Missing Stripe signature", 400);
      return;
    }
    await billingService.handleStripeWebhook(req.body as Buffer, signature);
    res.json({ received: true });
  }

  async sslCommerzIPN(req: Request, res: Response): Promise<void> {
    await billingService.handleSSLCommerzIPN(req.body);
    res.json({ received: true });
  }

  async getPaymentsByInvoice(req: Request, res: Response): Promise<void> {
    const result = await billingService.getPaymentsByInvoice(
      req.user!.organizationId!,
      req.params.invoiceId
    );
    sendSuccess(res, result);
  }
}