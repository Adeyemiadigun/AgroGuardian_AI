import {Router} from "express";
import { authenticate } from "../Middlewares/auth.middleware";
import upload from "../Middlewares/upload.middleware";
import { diagnoseController, getDiagnosisController, getDiagnosesByFarmController, updateStatusController, sendChatController, getChatController, toggleTaskController } from "../Controllers/diagnosis.controller";
import { validate } from "../Middlewares/validate.middleware";
import { cropDiagnosisSchema, diagnosisChatSchema ,updateDiagnosisStatusSchema } from "../Validators/diagnosis.validator";

const router = Router();

router.post("/", authenticate as any, upload.array("images", 5), diagnoseController as any);

router.get("/farm/:farmId", authenticate as any, getDiagnosesByFarmController as any);

router.get("/:diagnosisId", authenticate as any, getDiagnosisController as any);

router.patch("/:diagnosisId/status", authenticate as any, validate(updateDiagnosisStatusSchema), updateStatusController as any);

router.patch("/:diagnosisId/task/:taskId/toggle", authenticate as any, toggleTaskController as any);

router.post("/:diagnosisId/chat", authenticate as any, validate(diagnosisChatSchema), sendChatController as any);

router.get("/:diagnosisId/chat", authenticate as any, getChatController as any);

export default router;
