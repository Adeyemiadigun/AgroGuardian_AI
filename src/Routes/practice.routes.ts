import { Router } from "express";
import {
  createCropSeasonController,
  updateCropSeasonController,
  deleteCropSeasonController,
  deleteCropController,
  logActivityController,
  completeActivityController,
  getFarmActivitiesController,
  getFarmCropSeasonsController,
  addCropController,
  getFarmCropsController,
  getAllPracticesController,
  getReferenceCropsController,
  getReferenceCropsMaturityController,
} from "../Controllers/practice.controller";
import { authenticate } from "../Middlewares/auth.middleware";
import { validate } from "../Middlewares/validate.middleware";
import {
  createCropSeasonSchema,
  updateCropSeasonSchema,
  logPracticeActivitySchema,
  addCropSchema,
} from "../Validators/practice.validator";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticate as any);

router.get("/", getAllPracticesController as any);
router.get("/reference/crops", getReferenceCropsController as any);
router.get("/reference/crops/maturity", getReferenceCropsMaturityController as any);
router.post("/farms/:farmId/crops", validate(addCropSchema), addCropController as any);
router.get("/farms/:farmId/crops", getFarmCropsController as any);
router.delete("/farms/:farmId/crops/:cropId", deleteCropController as any);

router.post("/farms/:farmId/seasons", validate(createCropSeasonSchema), createCropSeasonController as any);
router.get("/farms/:farmId/seasons", getFarmCropSeasonsController as any);
router.patch(
  "/farms/:farmId/seasons/:seasonId",
  validate(updateCropSeasonSchema),
  updateCropSeasonController as any
);
router.delete("/farms/:farmId/seasons/:seasonId", deleteCropSeasonController as any);

// Phase 1: Start
router.post("/activities", upload.single("image"), validate(logPracticeActivitySchema), logActivityController as any);

// Phase 2: Complete
router.post("/activities/:activityId/complete", upload.single("image"), completeActivityController as any);

router.get("/farms/:farmId/activities", getFarmActivitiesController as any);

export default router;
