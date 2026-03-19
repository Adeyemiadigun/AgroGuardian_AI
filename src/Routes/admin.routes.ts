import { Router } from "express";
import { seedController } from "../Controllers/admin.controller";
import { authenticate, authorize } from "../Middlewares/auth.middleware";

const router = Router();

// Only admins can seed the database
router.post("/seed", authenticate, authorize("admin"), seedController);

export default router;
