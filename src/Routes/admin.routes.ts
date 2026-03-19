import { Router } from "express";
import { seedController } from "../Controllers/admin.controller";

const router = Router();

// In a real app, we'd add admin authentication middleware here.
router.post("/seed", seedController);

export default router;
