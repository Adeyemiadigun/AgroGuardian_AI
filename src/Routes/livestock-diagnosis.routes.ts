import { Router } from 'express';
import { livestockDiagnosisController } from '../Controllers/livestock-diagnosis.controller';
import { authenticate } from '../Middlewares/auth.middleware';
import upload from '../Middlewares/upload.middleware';

const router = Router();

// All routes require authentication
router.use('/', authenticate as any);

// Create new diagnosis for livestock (upload multiple images)
router.post(
  '/:livestockId/diagnose',
  upload.array('images', 5),
  livestockDiagnosisController.createDiagnosis.bind(livestockDiagnosisController)
);

// Get all diagnoses for a livestock
router.get(
  '/livestock/:livestockId',
  livestockDiagnosisController.getDiagnosesByLivestock.bind(livestockDiagnosisController)
);

// Get all diagnoses for a farm
router.get(
  '/farms/:farmId',
  livestockDiagnosisController.getDiagnosesByFarm.bind(livestockDiagnosisController)
);

// Get specific diagnosis
router.get(
  '/:diagnosisId',
  livestockDiagnosisController.getDiagnosis.bind(livestockDiagnosisController)
);

// Update diagnosis status
router.patch(
  '/:diagnosisId/status',
  livestockDiagnosisController.updateDiagnosisStatus.bind(livestockDiagnosisController)
);

// Toggle a treatment-plan task (auto-updates diagnosis status to treating/resolved)
router.patch(
  '/:diagnosisId/treatment-plan/:taskId/toggle',
  livestockDiagnosisController.toggleTreatmentPlanTask.bind(livestockDiagnosisController)
);

// Chat about diagnosis
router.post(
  '/:diagnosisId/chat',
  livestockDiagnosisController.chatAboutDiagnosis.bind(livestockDiagnosisController)
);

// Get chat history
router.get(
  '/:diagnosisId/chat',
  livestockDiagnosisController.getChatHistory.bind(livestockDiagnosisController)
);

export default router;
