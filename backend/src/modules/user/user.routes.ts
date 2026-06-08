// backend/src/modules/user/user.routes.ts
import { Router } from "express";
import { UserController } from "./user.controller";
import { authenticate } from "../../middlewares/authenticate";
import { validateRequest } from "../../middlewares/validateRequest";
import { updateProfileSchema, changePasswordSchema } from "./user.schema";

const router = Router();
const controller = new UserController();

router.use(authenticate);

router.get("/dashboard", controller.getDashboardStats.bind(controller));
router.patch("/profile", validateRequest(updateProfileSchema), controller.updateProfile.bind(controller));
router.patch("/change-password", validateRequest(changePasswordSchema), controller.changePassword.bind(controller));
router.get("/:userId", controller.getUserById.bind(controller));

export default router;