import { Router } from "express";
import {
  createCropSeasonController,
  logActivityController,
  getFarmActivitiesController,
  getFarmCropSeasonsController,
} from "../Controllers/practice.controller";
import { authenticate } from "../Middlewares/auth.middleware";
import { validate } from "../Middlewares/validate.middleware";
import { createCropSeasonSchema, logPracticeActivitySchema } from "../Validators/practice.validator";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticate as any);

router.post("/farms/:farmId/seasons", validate(createCropSeasonSchema), createCropSeasonController as any);
router.get("/farms/:farmId/seasons", getFarmCropSeasonsController as any);
router.post("/activities", upload.single("image"), validate(logPracticeActivitySchema), logActivityController as any);
router.get("/farms/:farmId/activities", getFarmActivitiesController as any);

export default router;
