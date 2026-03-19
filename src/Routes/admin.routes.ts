import { Router } from "express";
import { seedController } from "../Controllers/admin.controller";
import { authenticate, authorize } from "../Middlewares/auth.middleware";

const router = Router();

router.post("/seed", authenticate as any, authorize("admin") as any, seedController as any);

export default router;
