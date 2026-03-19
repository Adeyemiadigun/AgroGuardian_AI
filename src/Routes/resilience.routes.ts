import { Router } from "express";
import { getFarmResilience, triggerResilienceSync } from "../Controllers/resilience.controller";
import { authenticate } from "../Middlewares/auth.middleware";

const router = Router();

router.get("/:farmId", authenticate as any, getFarmResilience);
router.post("/:farmId/sync", authenticate as any, triggerResilienceSync);

export default router;
