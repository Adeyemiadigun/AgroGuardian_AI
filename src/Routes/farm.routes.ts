import { Router } from "express";
import { createFarmController, getAllFarms, getFarm, updateFarmController, deleteFarmController } from "../Controllers/farm.controller";
import { authenticate } from "../Middlewares/auth.middleware";
import { validate } from "../Middlewares/validate.middleware";
import { createFarmSchema, updateFarmSchema } from "../Validators/farm.validator";
import upload from "../Middlewares/upload.middleware";

const router = Router();

router.post("/", authenticate as any, upload.single("image"), createFarmController as any);

router.get("/", authenticate as any, getAllFarms as any);

router.get("/:farmId", authenticate as any, getFarm as any);

router.put("/:farmId", authenticate as any, validate(updateFarmSchema), updateFarmController as any);

router.delete("/:farmId", authenticate as any, deleteFarmController as any);

export default router;