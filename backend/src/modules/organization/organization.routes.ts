// backend/src/modules/organization/organization.routes.ts
import { Router } from "express";
import { OrganizationController } from "./organization.controller";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { validateRequest } from "../../middlewares/validateRequest";
import { updateOrganizationSchema, inviteUserSchema } from "./organization.schema";

const router = Router();
const controller = new OrganizationController();

router.use(authenticate);

router.get("/", controller.getOrganization.bind(controller));
router.patch("/", authorize("PROPERTY_OWNER", "SUPER_ADMIN"), validateRequest(updateOrganizationSchema), controller.updateOrganization.bind(controller));
router.get("/members", authorize("PROPERTY_OWNER", "PROPERTY_MANAGER", "SUPER_ADMIN"), controller.getMembers.bind(controller));
router.post("/members/invite", authorize("PROPERTY_OWNER", "SUPER_ADMIN"), validateRequest(inviteUserSchema), controller.inviteUser.bind(controller));
router.delete("/members/:userId", authorize("PROPERTY_OWNER", "SUPER_ADMIN"), controller.removeMember.bind(controller));
router.patch("/members/:userId/role", authorize("PROPERTY_OWNER", "SUPER_ADMIN"), controller.updateMemberRole.bind(controller));

export default router;