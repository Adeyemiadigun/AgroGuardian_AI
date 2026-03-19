import { Router } from "express";
import {
  generateCreditsController,
  getFarmCreditsController,
} from "../Controllers/credit.controller";
import { authenticate } from "../Middlewares/auth.middleware";
import { validate } from "../Middlewares/validate.middleware";
import { generateCreditsSchema } from "../Validators/practice.validator";

const router = Router();

router.use(authenticate);

router.post("/generate", validate(generateCreditsSchema), generateCreditsController);
router.get("/farms/:farmId", getFarmCreditsController);

export default router;
