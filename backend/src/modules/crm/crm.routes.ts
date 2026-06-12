// backend/src/modules/crm/crm.routes.ts
import { Router } from "express";
import { CrmController } from "./crm.controller";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { validateRequest } from "../../middlewares/validateRequest";
import {
  createLeadSchema,
  updateLeadSchema,
  updateLeadStatusSchema,
  scheduleVisitSchema,
  assignLeadSchema,
} from "./crm.schema";

const router = Router();
const controller = new CrmController();

const CRM_MANAGERS = [
  "SUPER_ADMIN", "PROPERTY_OWNER", "PROPERTY_MANAGER",
] as const;

const CRM_AGENTS = [...CRM_MANAGERS, "LEASING_AGENT"] as const;

router.use(authenticate);

// ─── Analytics ───────────────────────────────────
router.get(
  "/analytics/pipeline",
  authorize(...CRM_MANAGERS),
  controller.getPipelineAnalytics.bind(controller)
);

// ─── Agent leads ─────────────────────────────────
router.get(
  "/agents/:agentId/leads",
  authorize(...CRM_MANAGERS),
  controller.getAgentLeads.bind(controller)
);

// ─── Leads ───────────────────────────────────────
router.post(
  "/leads",
  authorize(...CRM_AGENTS),
  validateRequest(createLeadSchema),
  controller.createLead.bind(controller)
);

router.get(
  "/leads",
  authorize(...CRM_AGENTS),
  controller.getLeads.bind(controller)
);

router.get(
  "/leads/:leadId",
  authorize(...CRM_AGENTS),
  controller.getLeadById.bind(controller)
);

router.patch(
  "/leads/:leadId",
  authorize(...CRM_AGENTS),
  validateRequest(updateLeadSchema),
  controller.updateLead.bind(controller)
);

router.patch(
  "/leads/:leadId/status",
  authorize(...CRM_AGENTS),
  validateRequest(updateLeadStatusSchema),
  controller.updateLeadStatus.bind(controller)
);

router.delete(
  "/leads/:leadId",
  authorize(...CRM_MANAGERS),
  controller.deleteLead.bind(controller)
);

// ─── Assignment ──────────────────────────────────
router.patch(
  "/leads/:leadId/assign",
  authorize(...CRM_MANAGERS),
  validateRequest(assignLeadSchema),
  controller.assignLead.bind(controller)
);

// ─── Visits ──────────────────────────────────────
router.post(
  "/leads/:leadId/visits",
  authorize(...CRM_AGENTS),
  validateRequest(scheduleVisitSchema),
  controller.scheduleVisit.bind(controller)
);

router.get(
  "/leads/:leadId/visits",
  authorize(...CRM_AGENTS),
  controller.getVisitsByLead.bind(controller)
);

router.patch(
  "/visits/:visitId/complete",
  authorize(...CRM_AGENTS),
  controller.markVisitCompleted.bind(controller)
);

export default router;