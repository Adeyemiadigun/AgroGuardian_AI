import { Router } from "express";
import {
  createCropSeasonController,
  logActivityController,
  getFarmActivitiesController,
  getFarmCropSeasonsController,
} from "../Controllers/practice.controller";
import { authenticateJWT } from "../Middlewares/auth.middleware";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticateJWT);

router.post("/farms/:farmId/seasons", createCropSeasonController);
router.get("/farms/:farmId/seasons", getFarmCropSeasonsController);
router.post("/activities", upload.single("image"), logActivityController);
router.get("/farms/:farmId/activities", getFarmActivitiesController);

export default router;
