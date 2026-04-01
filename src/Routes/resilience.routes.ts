import { Router } from "express";
import { getFarmResilience, triggerResilienceSync } from "../Controllers/resilience.controller";
import { authenticate } from "../Middlewares/auth.middleware";

const router = Router();

router.get("/:farmId", authenticate as any, getFarmResilience as any);
router.post("/:farmId/sync", authenticate as any, triggerResilienceSync as any);

export default router;
