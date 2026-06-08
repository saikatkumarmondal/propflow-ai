// backend/src/modules/lease/lease.routes.ts
import { Router } from "express";
import { LeaseController } from "./lease.controller";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { validateRequest } from "../../middlewares/validateRequest";
import {
  createLeaseSchema,
  renewLeaseSchema,
  terminateLeaseSchema,
} from "./lease.schema";

const router = Router();
const controller = new LeaseController();

const LEASE_MANAGERS = ["SUPER_ADMIN", "PROPERTY_OWNER", "PROPERTY_MANAGER"] as const;

router.use(authenticate);

router.post("/",                    authorize(...LEASE_MANAGERS), validateRequest(createLeaseSchema),    controller.createLease.bind(controller));
router.get("/",                     authorize(...LEASE_MANAGERS), controller.getLeases.bind(controller));
router.get("/expiring",             authorize(...LEASE_MANAGERS), controller.getExpiringLeases.bind(controller));
router.get("/:leaseId",             controller.getLeaseById.bind(controller));
router.patch("/:leaseId/renew",     authorize(...LEASE_MANAGERS), validateRequest(renewLeaseSchema),     controller.renewLease.bind(controller));
router.patch("/:leaseId/terminate", authorize(...LEASE_MANAGERS), validateRequest(terminateLeaseSchema), controller.terminateLease.bind(controller));

export default router;