import { Router } from "express";
import { authenticate } from "../Middlewares/auth.middleware";
import upload from "../Middlewares/upload.middleware";
import {
  createConsultationController,
  getConsultationsController,
  getConsultationController,
  sendMessageController,
  updateStatusController,
  getAllConsultationsController,
} from "../Controllers/consultation.controller";

const router = Router();

router.post("/", authenticate as any, createConsultationController as any);

router.get("/", authenticate as any, getAllConsultationsController as any);

router.get("/farm/:farmId", authenticate as any, getConsultationsController as any);

router.get("/:consultationId", authenticate as any, getConsultationController as any);

router.post(
  "/:consultationId/message",
  authenticate as any,
  upload.array("images", 5),
  sendMessageController as any
);

router.patch("/:consultationId/status", authenticate as any, updateStatusController as any);

export default router;
