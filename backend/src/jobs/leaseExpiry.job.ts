// backend/src/jobs/leaseExpiry.job.ts
import { LeaseService } from "../modules/lease/lease.service";
import { logger } from "../config/logger";

const leaseService = new LeaseService();

const CRON_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

const runLeaseExpiryJob = async (): Promise<void> => {
  logger.info("[LeaseExpiryJob] Starting lease expiry check...");

  try {
    await leaseService.processLeaseExpiryAlerts();
    logger.info("[LeaseExpiryJob] Completed successfully");
  } catch (error) {
    logger.error("[LeaseExpiryJob] Failed:", error);
  }
};

export const startLeaseExpiryJob = (): void => {
  // Run once immediately on boot
  runLeaseExpiryJob();

  // Then every 24 hours
  setInterval(runLeaseExpiryJob, CRON_INTERVAL_MS);

  logger.info("[LeaseExpiryJob] Scheduled — runs every 24 hours");
};