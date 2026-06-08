// backend/src/modules/property/property.routes.ts
import { Router } from "express";
import { PropertyController } from "./property.controller";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { validateRequest } from "../../middlewares/validateRequest";
import {
  createPropertySchema,
  updatePropertySchema,
  createBuildingSchema,
  updateBuildingSchema,
  createFloorSchema,
  createUnitSchema,
  updateUnitSchema,
} from "./property.schema";

const router = Router();
const controller = new PropertyController();

const PROPERTY_MANAGERS = [
  "SUPER_ADMIN",
  "PROPERTY_OWNER",
  "PROPERTY_MANAGER",
] as const;

router.use(authenticate);

// ─── Properties ─────────────────────────────────
router.get("/vacancy-summary", controller.getVacancySummary.bind(controller));
router.post("/", authorize(...PROPERTY_MANAGERS), validateRequest(createPropertySchema), controller.createProperty.bind(controller));
router.get("/", controller.getProperties.bind(controller));
router.get("/:propertyId", controller.getPropertyById.bind(controller));
router.patch("/:propertyId", authorize(...PROPERTY_MANAGERS), validateRequest(updatePropertySchema), controller.updateProperty.bind(controller));
router.delete("/:propertyId", authorize("SUPER_ADMIN", "PROPERTY_OWNER"), controller.deleteProperty.bind(controller));

// ─── Buildings ──────────────────────────────────
router.post("/:propertyId/buildings", authorize(...PROPERTY_MANAGERS), validateRequest(createBuildingSchema), controller.createBuilding.bind(controller));
router.get("/:propertyId/buildings", controller.getBuildings.bind(controller));
router.patch("/:propertyId/buildings/:buildingId", authorize(...PROPERTY_MANAGERS), validateRequest(updateBuildingSchema), controller.updateBuilding.bind(controller));
router.delete("/:propertyId/buildings/:buildingId", authorize("SUPER_ADMIN", "PROPERTY_OWNER"), controller.deleteBuilding.bind(controller));

// ─── Floors ─────────────────────────────────────
router.post("/:propertyId/buildings/:buildingId/floors", authorize(...PROPERTY_MANAGERS), validateRequest(createFloorSchema), controller.createFloor.bind(controller));
router.get("/:propertyId/buildings/:buildingId/floors", controller.getFloors.bind(controller));
router.delete("/:propertyId/buildings/:buildingId/floors/:floorId", authorize("SUPER_ADMIN", "PROPERTY_OWNER"), controller.deleteFloor.bind(controller));

// ─── Units ──────────────────────────────────────
router.post("/:propertyId/units", authorize(...PROPERTY_MANAGERS), validateRequest(createUnitSchema), controller.createUnit.bind(controller));
router.get("/:propertyId/units", controller.getUnits.bind(controller));
router.get("/:propertyId/units/:unitId", controller.getUnitById.bind(controller));
router.patch("/:propertyId/units/:unitId", authorize(...PROPERTY_MANAGERS), validateRequest(updateUnitSchema), controller.updateUnit.bind(controller));
router.delete("/:propertyId/units/:unitId", authorize("SUPER_ADMIN", "PROPERTY_OWNER"), controller.deleteUnit.bind(controller));

export default router;