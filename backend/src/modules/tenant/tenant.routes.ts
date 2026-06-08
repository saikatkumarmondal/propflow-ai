// backend/src/modules/tenant/tenant.routes.ts
import { Router } from "express";
import { TenantController } from "./tenant.controller";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { validateRequest } from "../../middlewares/validateRequest";
import { createTenantSchema, updateTenantSchema } from "./tenant.schema";

const router = Router();
const controller = new TenantController();

const TENANT_MANAGERS = ["SUPER_ADMIN", "PROPERTY_OWNER", "PROPERTY_MANAGER"] as const;

router.use(authenticate);

router.post("/",   authorize(...TENANT_MANAGERS), validateRequest(createTenantSchema), controller.createTenant.bind(controller));
router.get("/",    authorize(...TENANT_MANAGERS), controller.getTenants.bind(controller));
router.get("/:tenantId",  controller.getTenantById.bind(controller));
router.patch("/:tenantId", authorize(...TENANT_MANAGERS), validateRequest(updateTenantSchema), controller.updateTenant.bind(controller));
router.delete("/:tenantId", authorize("SUPER_ADMIN", "PROPERTY_OWNER"), controller.deleteTenant.bind(controller));

export default router;