import { Router } from "express";
import {
  generateCreditsController,
  getFarmCreditsController,
} from "../Controllers/credit.controller";
import { authenticateJWT } from "../Middlewares/auth.middleware";

const router = Router();

router.use(authenticateJWT);

router.post("/generate", generateCreditsController);
router.get("/farms/:farmId", getFarmCreditsController);

export default router;
