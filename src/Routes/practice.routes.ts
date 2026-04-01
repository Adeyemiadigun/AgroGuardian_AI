import { Router } from "express";
import {
  createCropSeasonController,
  logActivityController,
  getFarmActivitiesController,
  getFarmCropSeasonsController,
  addCropController,
  getFarmCropsController,
  getAllPracticesController,
  getReferenceCropsController,
} from "../Controllers/practice.controller";
import { authenticate } from "../Middlewares/auth.middleware";
import { validate } from "../Middlewares/validate.middleware";
import { createCropSeasonSchema, logPracticeActivitySchema, addCropSchema } from "../Validators/practice.validator";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticate as any);

router.get("/", getAllPracticesController as any);
router.get("/reference/crops", getReferenceCropsController as any);
router.post("/farms/:farmId/crops", validate(addCropSchema), addCropController as any);
router.get("/farms/:farmId/crops", getFarmCropsController as any);
router.post("/farms/:farmId/seasons", validate(createCropSeasonSchema), createCropSeasonController as any);
router.get("/farms/:farmId/seasons", getFarmCropSeasonsController as any);
router.post("/activities", upload.single("image"), validate(logPracticeActivitySchema), logActivityController as any);
router.get("/farms/:farmId/activities", getFarmActivitiesController as any);

export default router;
