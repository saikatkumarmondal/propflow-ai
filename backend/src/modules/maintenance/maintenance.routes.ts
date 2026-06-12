// backend/src/modules/maintenance/maintenance.routes.ts
import { Router } from "express";
import { MaintenanceController } from "./maintenance.controller";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { validateRequest } from "../../middlewares/validateRequest";
import {
  createMaintenanceRequestSchema,
  assignTechnicianSchema,
  updateMaintenanceStatusSchema,
  addCompletionNotesSchema,
} from "./maintenance.schema";

const router = Router();
const controller = new MaintenanceController();

const MAINTENANCE_MANAGERS = [
  "SUPER_ADMIN", "PROPERTY_OWNER", "PROPERTY_MANAGER", "MAINTENANCE_MANAGER",
] as const;

router.use(authenticate);

// ── Summary ──────────────────────────────────────
router.get(
  "/summary",
  authorize(...MAINTENANCE_MANAGERS),
  controller.getSummary.bind(controller)
);

// ── Technician: my jobs ───────────────────────────
router.get(
  "/my-jobs",
  authorize("TECHNICIAN"),
  controller.getMyJobs.bind(controller)
);

// ── Create request (Tenant + Managers) ───────────
router.post(
  "/",
  authorize("TENANT", ...MAINTENANCE_MANAGERS),
  validateRequest(createMaintenanceRequestSchema),
  controller.createRequest.bind(controller)
);

// ── List all requests ─────────────────────────────
router.get(
  "/",
  authorize(...MAINTENANCE_MANAGERS),
  controller.getRequests.bind(controller)
);

// ── Single request ────────────────────────────────
router.get(
  "/:requestId",
  controller.getRequestById.bind(controller)
);

// ── Assign technician ─────────────────────────────
router.patch(
  "/:requestId/assign",
  authorize(...MAINTENANCE_MANAGERS),
  validateRequest(assignTechnicianSchema),
  controller.assignTechnician.bind(controller)
);

// ── Update status ─────────────────────────────────
router.patch(
  "/:requestId/status",
  authorize("TECHNICIAN", ...MAINTENANCE_MANAGERS),
  validateRequest(updateMaintenanceStatusSchema),
  controller.updateStatus.bind(controller)
);

// ── Completion report (Technician) ───────────────
router.patch(
  "/:requestId/complete",
  authorize("TECHNICIAN"),
  validateRequest(addCompletionNotesSchema),
  controller.addCompletionReport.bind(controller)
);

export default router;