// backend/src/modules/auth/auth.routes.ts
import { Router } from "express";
import { AuthController } from "./auth.controller";
import { validateRequest } from "../../middlewares/validateRequest";
import { authenticate } from "../../middlewares/authenticate";
import { authRateLimiter } from "../../middlewares/rateLimiter";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  refreshTokenSchema,
} from "./auth.schema";

const router = Router();
const controller = new AuthController();

router.post("/register", authRateLimiter, validateRequest(registerSchema), controller.register.bind(controller));
router.get("/verify-email", controller.verifyEmail.bind(controller));
router.post("/login", authRateLimiter, validateRequest(loginSchema), controller.login.bind(controller));
router.post("/refresh-token", validateRequest(refreshTokenSchema), controller.refreshToken.bind(controller));
router.post("/logout", controller.logout.bind(controller));
router.post("/forgot-password", authRateLimiter, validateRequest(forgotPasswordSchema), controller.forgotPassword.bind(controller));
router.post("/reset-password", validateRequest(resetPasswordSchema), controller.resetPassword.bind(controller));
router.get("/me", authenticate, controller.getMe.bind(controller));

export default router;