import { Router } from "express";
import {
  generateCreditsController,
  getFarmCreditsController,
  getUserCreditsController,
} from "../Controllers/credit.controller";
import { authenticate } from "../Middlewares/auth.middleware";
import { validate } from "../Middlewares/validate.middleware";
import { generateCreditsSchema } from "../Validators/practice.validator";

const router = Router();

router.use(authenticate as any);

router.post("/generate", validate(generateCreditsSchema), generateCreditsController as any);
router.get("/history", getUserCreditsController as any);
router.get("/farms/:farmId", getFarmCreditsController as any);

export default router;
