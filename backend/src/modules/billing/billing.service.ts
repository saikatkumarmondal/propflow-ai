// backend/src/modules/billing/billing.service.ts
import Stripe from "stripe";
import dayjs from "dayjs";
import { prisma } from "../../config/database";
import { ENV } from "../../config/env";
import { sendEmail } from "../../utils/email";
import { createAuditLog } from "../../utils/auditLog";
import { generateInvoiceNumber } from "../../utils/invoiceNumber";
import { buildResponse, ParsedQuery } from "../../utils/queryBuilder";
import {
  CreateInvoiceInput,
  CreateUtilityInvoiceInput,
  RecordCashPaymentInput,
} from "./billing.schema";

const stripe = new Stripe(ENV.STRIPE_SECRET_KEY, { apiVersion: "2025-04-30.basil" });

const TAX_RATE_DEFAULT = 0;

export class BillingService {
  // ─── Invoices ────────────────────────────────────

  async createRentInvoice(
    organizationId: string,
    actorId: string,
    input: CreateInvoiceInput
  ) {
    const lease = await this.resolveLease(organizationId, input.leaseId);

    const totalAmount = input.amount + (input.tax ?? TAX_RATE_DEFAULT);
    const invoiceNumber = generateInvoiceNumber();

    const invoice = await prisma.invoice.create({
      data: {
        organizationId,
        leaseId:       input.leaseId,
        invoiceNumber,
        amount:        input.amount,
        tax:           input.tax ?? 0,
        totalAmount,
        currency:      input.currency,
        dueDate:       new Date(input.dueDate),
        description:   input.description,
        status:        "PENDING",
      },
      include: {
        lease: {
          include: {
            tenant: {
              include: {
                user: { select: { firstName: true, email: true } },
              },
            },
            unit: {
              select: {
                unitNumber: true,
                property: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    await createAuditLog({
      organizationId,
      userId:    actorId,
      action:    "CREATE",
      entity:    "Invoice",
      entityId:  invoice.id,
      newValues: { invoiceNumber, amount: totalAmount },
    });

    await this.sendInvoiceEmail(invoice);

    return invoice;
  }

  async createUtilityInvoice(
    organizationId: string,
    actorId: string,
    input: CreateUtilityInvoiceInput
  ) {
    await this.resolveLease(organizationId, input.leaseId);

    const subtotal    = input.items.reduce((sum, item) => sum + item.amount, 0);
    const totalAmount = subtotal + (input.tax ?? 0);
    const invoiceNumber = generateInvoiceNumber();

    const itemsDescription = input.items
      .map((i) => `${i.label}: ${i.amount}`)
      .join(" | ");

    const invoice = await prisma.invoice.create({
      data: {
        organizationId,
        leaseId:     input.leaseId,
        invoiceNumber,
        amount:      subtotal,
        tax:         input.tax ?? 0,
        totalAmount,
        currency:    input.currency,
        dueDate:     new Date(input.dueDate),
        description: `${input.description} [${itemsDescription}]`,
        status:      "PENDING",
      },
      include: {
        lease: {
          include: {
            tenant: {
              include: {
                user: { select: { firstName: true, email: true } },
              },
            },
            unit: {
              select: {
                unitNumber: true,
                property: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    await createAuditLog({
      organizationId,
      userId:    actorId,
      action:    "CREATE",
      entity:    "Invoice",
      entityId:  invoice.id,
      newValues: { invoiceNumber, type: "UTILITY", totalAmount },
    });

    await this.sendInvoiceEmail(invoice);

    return invoice;
  }

  async getInvoices(organizationId: string, query: ParsedQuery) {
    const statusFilter = query.where["status"] as string | undefined;

    const where = {
      organizationId,
      ...(statusFilter ? { status: statusFilter as any } : {}),
    };

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          lease: {
            include: {
              tenant: {
                include: {
                  user: {
                    select: { firstName: true, lastName: true, email: true },
                  },
                },
              },
              unit: {
                select: {
                  unitNumber: true,
                  property: { select: { name: true } },
                },
              },
            },
          },
          payments: { orderBy: { paidAt: "desc" }, take: 1 },
        },
        orderBy: query.orderBy,
        skip:    query.skip,
        take:    query.take,
      }),
      prisma.invoice.count({ where }),
    ]);

    return buildResponse(invoices, total, query);
  }

  async getInvoiceById(organizationId: string, invoiceId: string) {
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId },
      include: {
        lease: {
          include: {
            tenant: {
              include: {
                user: {
                  select: {
                    id: true, firstName: true, lastName: true,
                    email: true, phone: true,
                  },
                },
              },
            },
            unit: {
              include: {
                property: { select: { id: true, name: true, address: true } },
              },
            },
          },
        },
        payments: { orderBy: { paidAt: "desc" } },
      },
    });

    if (!invoice) throw new Error("Invoice not found");
    return invoice;
  }

  async getOverdueSummary(organizationId: string) {
    const [overdueCount, overdueTotal, pendingCount] = await Promise.all([
      prisma.invoice.count({ where: { organizationId, status: "OVERDUE" } }),
      prisma.invoice.aggregate({
        where:  { organizationId, status: "OVERDUE" },
        _sum:   { totalAmount: true },
      }),
      prisma.invoice.count({ where: { organizationId, status: "PENDING" } }),
    ]);

    return {
      overdueCount,
      overdueTotal:  Number(overdueTotal._sum.totalAmount ?? 0),
      pendingCount,
    };
  }

  // ─── Payments ────────────────────────────────────

  async recordCashPayment(
    organizationId: string,
    actorId: string,
    input: RecordCashPaymentInput
  ) {
    const invoice = await this.resolveInvoice(organizationId, input.invoiceId);

    if (invoice.status === "PAID") throw new Error("Invoice is already paid");
    if (invoice.status === "CANCELLED") throw new Error("Cannot pay a cancelled invoice");

    const totalPaid = await this.getTotalPaidAmount(invoice.id);
    const remaining = Number(invoice.totalAmount) - totalPaid;

    if (input.amount > remaining) {
      throw new Error(
        `Payment amount (${input.amount}) exceeds remaining balance (${remaining})`
      );
    }

    const payment = await prisma.payment.create({
      data: {
        invoiceId:     invoice.id,
        amount:        input.amount,
        currency:      invoice.currency,
        paymentMethod: "CASH",
        gatewayResponse: input.note ? { note: input.note } : undefined,
        paidAt:        new Date(),
      },
    });

    const newTotalPaid = totalPaid + input.amount;
    if (newTotalPaid >= Number(invoice.totalAmount)) {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data:  { status: "PAID", paidAt: new Date() },
      });
    }

    await createAuditLog({
      organizationId,
      userId:    actorId,
      action:    "PAYMENT",
      entity:    "Invoice",
      entityId:  invoice.id,
      newValues: { method: "CASH", amount: input.amount },
    });

    await this.sendPaymentReceiptEmail(invoice.id, payment.id);

    return payment;
  }

  async initiateStripePayment(organizationId: string, invoiceId: string) {
    const invoice = await this.resolveInvoice(organizationId, invoiceId);

    if (invoice.status === "PAID") throw new Error("Invoice is already paid");

    const totalPaid = await this.getTotalPaidAmount(invoice.id);
    const remaining = Number(invoice.totalAmount) - totalPaid;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency:     invoice.currency.toLowerCase(),
            product_data: { name: `Invoice ${invoice.invoiceNumber}` },
            unit_amount:  Math.round(remaining * 100),
          },
          quantity: 1,
        },
      ],
      mode:        "payment",
      success_url: `${ENV.CLIENT_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}&invoice=${invoiceId}`,
      cancel_url:  `${ENV.CLIENT_URL}/billing/invoices/${invoiceId}`,
      metadata:    { invoiceId, organizationId },
    });

    return { checkoutUrl: session.url, sessionId: session.id };
  }

  async handleStripeWebhook(rawBody: Buffer, signature: string) {
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        ENV.STRIPE_WEBHOOK_SECRET
      );
    } catch {
      throw new Error("Invalid Stripe webhook signature");
    }

    if (event.type === "checkout.session.completed") {
      const session  = event.data.object as Stripe.CheckoutSession;
      const invoiceId       = session.metadata?.invoiceId;
      const organizationId  = session.metadata?.organizationId;

      if (!invoiceId || !organizationId) return;

      const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
      if (!invoice || invoice.status === "PAID") return;

      const amountPaid = (session.amount_total ?? 0) / 100;

      const payment = await prisma.payment.create({
        data: {
          invoiceId,
          amount:          amountPaid,
          currency:        invoice.currency,
          paymentMethod:   "STRIPE",
          transactionId:   session.payment_intent as string,
          gatewayResponse: { sessionId: session.id },
          paidAt:          new Date(),
        },
      });

      await prisma.invoice.update({
        where: { id: invoiceId },
        data:  { status: "PAID", paidAt: new Date() },
      });

      await this.sendPaymentReceiptEmail(invoiceId, payment.id);
    }
  }

  async initiateSSLCommerzPayment(organizationId: string, invoiceId: string) {
    const invoice = await this.resolveInvoice(organizationId, invoiceId);
    if (invoice.status === "PAID") throw new Error("Invoice is already paid");

    const totalPaid = await this.getTotalPaidAmount(invoice.id);
    const remaining = Number(invoice.totalAmount) - totalPaid;

    // SSLCommerz init payload — dummy response for testing
    const sslData = {
      store_id:         ENV.SSLCOMMERZ_STORE_ID,
      store_passwd:     ENV.SSLCOMMERZ_STORE_PASS,
      total_amount:     remaining,
      currency:         invoice.currency,
      tran_id:          `PROPFLOW-${invoiceId}-${Date.now()}`,
      success_url:      `${ENV.CLIENT_URL}/billing/sslcommerz/success`,
      fail_url:         `${ENV.CLIENT_URL}/billing/sslcommerz/fail`,
      cancel_url:       `${ENV.CLIENT_URL}/billing/invoices/${invoiceId}`,
      ipn_url:          `${ENV.CLIENT_URL}/api/v1/billing/sslcommerz/ipn`,
      product_name:     `Invoice ${invoice.invoiceNumber}`,
      product_category: "Rent",
      product_profile:  "general",
    };

    if (!ENV.SSLCOMMERZ_IS_LIVE) {
      return {
        isDummy:      true,
        message:      "SSLCommerz sandbox mode — use test credentials to complete payment",
        invoiceId,
        amount:       remaining,
        currency:     invoice.currency,
        sslPayload:   sslData,
        sandboxUrl:   "https://sandbox.sslcommerz.com/gwprocess/v4/api.php",
      };
    }

    return { sslData };
  }

  async handleSSLCommerzIPN(body: Record<string, string>) {
    const { tran_id, status, amount, currency } = body;

    if (status !== "VALID" && status !== "VALIDATED") return;

    // tran_id format: PROPFLOW-{invoiceId}-{timestamp}
    const invoiceId = tran_id?.split("-")[1];
    if (!invoiceId) return;

    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice || invoice.status === "PAID") return;

    const payment = await prisma.payment.create({
      data: {
        invoiceId,
        amount:          parseFloat(amount),
        currency:        currency ?? invoice.currency,
        paymentMethod:   "SSLCOMMERZ",
        transactionId:   tran_id,
        gatewayResponse: body as any,
        paidAt:          new Date(),
      },
    });

    await prisma.invoice.update({
      where: { id: invoiceId },
      data:  { status: "PAID", paidAt: new Date() },
    });

    await this.sendPaymentReceiptEmail(invoiceId, payment.id);
  }

  async getPaymentsByInvoice(organizationId: string, invoiceId: string) {
    await this.resolveInvoice(organizationId, invoiceId);

    return prisma.payment.findMany({
      where:   { invoiceId },
      orderBy: { paidAt: "desc" },
    });
  }

  // ── Auto-generate monthly rent invoices (called by cron) ──
  async generateMonthlyRentInvoices(): Promise<void> {
    const today   = dayjs();
    const dueDate = today.add(7, "day").toDate();

    const activeLeases = await prisma.lease.findMany({
      where: { status: "ACTIVE" },
      include: {
        tenant: {
          include: {
            user: { select: { firstName: true, email: true } },
          },
        },
        unit: {
          select: {
            unitNumber: true,
            property: { select: { organizationId: true, name: true } },
          },
        },
      },
    });

    for (const lease of activeLeases) {
      // Skip if invoice already generated this month
      const existingInvoice = await prisma.invoice.findFirst({
        where: {
          leaseId: lease.id,
          createdAt: {
            gte: today.startOf("month").toDate(),
            lte: today.endOf("month").toDate(),
          },
          description: { contains: "Monthly Rent" },
        },
      });

      if (existingInvoice) continue;

      const invoiceNumber = generateInvoiceNumber();

      await prisma.invoice.create({
        data: {
          organizationId: lease.unit.property.organizationId,
          leaseId:        lease.id,
          invoiceNumber,
          amount:         Number(lease.rentAmount),
          tax:            0,
          totalAmount:    Number(lease.rentAmount),
          currency:       "BDT",
          dueDate,
          description:    `Monthly Rent — ${today.format("MMMM YYYY")}`,
          status:         "PENDING",
        },
      });
    }
  }

  // ── Mark overdue invoices (called by cron) ──
  async markOverdueInvoices(): Promise<void> {
    await prisma.invoice.updateMany({
      where: {
        status:  "PENDING",
        dueDate: { lt: new Date() },
      },
      data: { status: "OVERDUE" },
    });
  }

  // ─── Private Helpers ─────────────────────────────

  private async resolveLease(organizationId: string, leaseId: string) {
    const lease = await prisma.lease.findFirst({
      where: { id: leaseId, tenant: { organizationId } },
    });
    if (!lease) throw new Error("Lease not found in this organization");
    if (lease.status === "TERMINATED") throw new Error("Lease is terminated");
    return lease;
  }

  private async resolveInvoice(organizationId: string, invoiceId: string) {
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId },
    });
    if (!invoice) throw new Error("Invoice not found");
    return invoice;
  }

  private async getTotalPaidAmount(invoiceId: string): Promise<number> {
    const result = await prisma.payment.aggregate({
      where: { invoiceId },
      _sum:  { amount: true },
    });
    return Number(result._sum.amount ?? 0);
  }

  private async sendInvoiceEmail(invoice: any): Promise<void> {
    const tenant = invoice.lease?.tenant?.user;
    const unit   = invoice.lease?.unit;
    if (!tenant?.email) return;

    await sendEmail({
      to:      tenant.email,
      subject: `New Invoice ${invoice.invoiceNumber} — PropFlow AI`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <h2>New Invoice</h2>
          <p>Hi ${tenant.firstName},</p>
          <p>A new invoice has been generated for Unit
             <strong>${unit?.unitNumber}</strong>
             at <strong>${unit?.property?.name}</strong>.</p>
          <table style="width:100%;border-collapse:collapse;margin-top:16px;">
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Invoice #</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">${invoice.invoiceNumber}</td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Description</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">${invoice.description}</td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Amount</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">
                ${invoice.totalAmount} ${invoice.currency}
              </td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Due Date</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">
                ${dayjs(invoice.dueDate).format("DD MMM YYYY")}
              </td>
            </tr>
          </table>
          <p style="margin-top:16px;">Login to PropFlow AI to pay your invoice.</p>
        </div>
      `,
    });
  }

  private async sendPaymentReceiptEmail(
    invoiceId: string,
    paymentId: string
  ): Promise<void> {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        lease: {
          include: {
            tenant: {
              include: {
                user: { select: { firstName: true, email: true } },
              },
            },
            unit: {
              select: {
                unitNumber: true,
                property: { select: { name: true } },
              },
            },
          },
        },
        payments: { where: { id: paymentId } },
      },
    });

    if (!invoice?.lease?.tenant?.user?.email) return;

    const tenant  = invoice.lease.tenant.user;
    const unit    = invoice.lease.unit;
    const payment = invoice.payments[0];

    await sendEmail({
      to:      tenant.email,
      subject: `Payment Receipt — ${invoice.invoiceNumber}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <h2 style="color:#16a34a;">✓ Payment Received</h2>
          <p>Hi ${tenant.firstName}, your payment has been confirmed.</p>
          <table style="width:100%;border-collapse:collapse;margin-top:16px;">
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Invoice #</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">${invoice.invoiceNumber}</td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Unit</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">
                ${unit.unitNumber} — ${unit.property.name}
              </td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Amount Paid</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">
                ${payment?.amount} ${invoice.currency}
              </td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Method</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">${payment?.paymentMethod}</td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Date</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">
                ${dayjs(payment?.paidAt).format("DD MMM YYYY hh:mm A")}
              </td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Status</td>
              <td style="padding:8px;border:1px solid #e5e7eb;color:#16a34a;">
                ${invoice.status}
              </td>
            </tr>
          </table>
          <p style="margin-top:16px;">Thank you for your payment.</p>
        </div>
      `,
    });
  }
}