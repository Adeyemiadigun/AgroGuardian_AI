import { Router } from 'express';
import multer from 'multer';
import { verifyAccessToken } from '../Middlewares/auth.middleware';
import { vetConsultationController } from '../Controllers/vet-consultation.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// All routes require authentication
router.use('/', verifyAccessToken as any);

// Start new consultation (with optional images)
router.post(
  '/',
  upload.array('images', 5),
  vetConsultationController.startConsultation.bind(vetConsultationController)
);

// Send message in consultation (with optional images)
router.post(
  '/:consultationId/messages',
  upload.array('images', 5),
  vetConsultationController.sendMessage.bind(vetConsultationController)
);

// Get single consultation
router.get(
  '/:consultationId',
  vetConsultationController.getConsultation.bind(vetConsultationController)
);

// Get consultations for farm
router.get(
  '/farms/:farmId',
  vetConsultationController.getConsultations.bind(vetConsultationController)
);

// Update consultation (status, title, etc.)
router.patch(
  '/:consultationId',
  vetConsultationController.updateConsultation.bind(vetConsultationController)
);

// Delete consultation
router.delete(
  '/:consultationId',
  vetConsultationController.deleteConsultation.bind(vetConsultationController)
);

export default router;
