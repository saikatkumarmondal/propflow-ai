// backend/src/modules/billing/billing.routes.ts
import { Router } from "express";
import express from "express";
import { BillingController } from "./billing.controller";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { validateRequest } from "../../middlewares/validateRequest";
import {
  createInvoiceSchema,
  createUtilityInvoiceSchema,
  recordCashPaymentSchema,
  initiateStripePaymentSchema,
  initiateSSLCommerzPaymentSchema,
} from "./billing.schema";

const router = Router();
const controller = new BillingController();

const BILLING_MANAGERS = [
  "SUPER_ADMIN", "PROPERTY_OWNER", "PROPERTY_MANAGER", "ACCOUNTANT",
] as const;

// ── Stripe webhook needs raw body ── must be before express.json()
router.post(
  "/stripe/webhook",
  express.raw({ type: "application/json" }),
  controller.stripeWebhook.bind(controller)
);

// ── SSLCommerz IPN (no auth — called by gateway) ──
router.post("/sslcommerz/ipn", controller.sslCommerzIPN.bind(controller));

router.use(authenticate);

// ─── Invoices ────────────────────────────────────
router.post("/invoices/rent",    authorize(...BILLING_MANAGERS), validateRequest(createInvoiceSchema),        controller.createRentInvoice.bind(controller));
router.post("/invoices/utility", authorize(...BILLING_MANAGERS), validateRequest(createUtilityInvoiceSchema), controller.createUtilityInvoice.bind(controller));
router.get("/invoices",          authorize(...BILLING_MANAGERS), controller.getInvoices.bind(controller));
router.get("/invoices/overdue-summary", authorize(...BILLING_MANAGERS), controller.getOverdueSummary.bind(controller));
router.get("/invoices/:invoiceId",      controller.getInvoiceById.bind(controller));
router.get("/invoices/:invoiceId/payments", controller.getPaymentsByInvoice.bind(controller));

// ─── Payments ────────────────────────────────────
router.post("/payments/cash",       authorize(...BILLING_MANAGERS), validateRequest(recordCashPaymentSchema),          controller.recordCashPayment.bind(controller));
router.post("/payments/stripe",     authorize("TENANT", ...BILLING_MANAGERS), validateRequest(initiateStripePaymentSchema),    controller.initiateStripePayment.bind(controller));
router.post("/payments/sslcommerz", authorize("TENANT", ...BILLING_MANAGERS), validateRequest(initiateSSLCommerzPaymentSchema), controller.initiateSSLCommerzPayment.bind(controller));

export default router;