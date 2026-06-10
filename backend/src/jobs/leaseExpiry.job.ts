// backend/src/jobs/leaseExpiry.job.ts
import { logger } from "../config/logger";

export const startLeaseExpiryJob = (): void => {
  // Disabled temporarily — enable after WebSocket issue resolved
  logger.info("[LeaseExpiryJob] Disabled in development mode");
};