// backend/src/jobs/billing.job.ts
import { BillingService } from "../modules/billing/billing.service";
import { logger } from "../config/logger";

const billingService = new BillingService();

const MONTHLY_INVOICE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;  // 24h
const OVERDUE_CHECK_INTERVAL_MS         = 6  * 60 * 60 * 1000;  // 6h

export const startBillingJobs = (): void => {
  // ── Monthly rent invoice generation ──
  setInterval(async () => {
    const today = new Date();
    // Only run on the 1st of each month
    if (today.getDate() !== 1) return;

    logger.info("[BillingJob] Generating monthly rent invoices...");
    try {
      await billingService.generateMonthlyRentInvoices();
      logger.info("[BillingJob] Monthly invoices generated");
    } catch (error) {
      logger.error("[BillingJob] Monthly invoice generation failed:", error);
    }
  }, MONTHLY_INVOICE_CHECK_INTERVAL_MS);

  // ── Mark overdue invoices every 6 hours ──
  const runOverdueCheck = async () => {
    logger.info("[BillingJob] Marking overdue invoices...");
    try {
      await billingService.markOverdueInvoices();
      logger.info("[BillingJob] Overdue check complete");
    } catch (error) {
      logger.error("[BillingJob] Overdue check failed:", error);
    }
  };

  runOverdueCheck();
  setInterval(runOverdueCheck, OVERDUE_CHECK_INTERVAL_MS);

  logger.info("[BillingJob] Scheduled — monthly invoices + overdue checks active");
};