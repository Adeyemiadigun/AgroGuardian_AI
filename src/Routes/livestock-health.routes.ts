import { Router } from 'express';
import { livestockHealthController } from '../Controllers/livestock-health.controller';
import { authenticate } from '../Middlewares/auth.middleware';
import upload from '../Middlewares/upload.middleware';

const router = Router();

// All routes require authentication
router.use('/', authenticate as any);

// ==================== INDIVIDUAL LIVESTOCK HEALTH RECORDS ====================

// Vaccinations for specific livestock
router.post('/:livestockId/vaccinations', livestockHealthController.addVaccination.bind(livestockHealthController));
router.get('/:livestockId/vaccinations', livestockHealthController.getVaccinations.bind(livestockHealthController));

// Treatments for specific livestock
router.post('/:livestockId/treatments', livestockHealthController.addTreatment.bind(livestockHealthController));
router.get('/:livestockId/treatments', livestockHealthController.getTreatments.bind(livestockHealthController));

// Illnesses for specific livestock (with image upload support)
router.post(
  '/:livestockId/illnesses',
  upload.array('images', 5),
  livestockHealthController.reportIllness.bind(livestockHealthController)
);
router.get('/:livestockId/illnesses', livestockHealthController.getIllnesses.bind(livestockHealthController));

// Checkups for specific livestock
router.post('/:livestockId/checkups', livestockHealthController.addCheckup.bind(livestockHealthController));
router.get('/:livestockId/checkups', livestockHealthController.getCheckups.bind(livestockHealthController));

// Dewormings for specific livestock
router.post('/:livestockId/dewormings', livestockHealthController.addDeworming.bind(livestockHealthController));
router.get('/:livestockId/dewormings', livestockHealthController.getDewormings.bind(livestockHealthController));

// All health records for specific livestock
router.get('/:livestockId/all', livestockHealthController.getAllHealthRecords.bind(livestockHealthController));

// ==================== FARM-LEVEL HEALTH MANAGEMENT ====================

// Health summary for farm
router.get('/farms/:farmId/summary', livestockHealthController.getHealthSummary.bind(livestockHealthController));

// Upcoming vaccinations for farm
router.get('/farms/:farmId/vaccinations/upcoming', livestockHealthController.getUpcomingVaccinations.bind(livestockHealthController));

// Active treatments for farm
router.get('/farms/:farmId/treatments/active', livestockHealthController.getActiveTreatments.bind(livestockHealthController));

// Active illnesses for farm
router.get('/farms/:farmId/illnesses/active', livestockHealthController.getActiveIllnesses.bind(livestockHealthController));

// Recent checkups for farm
router.get('/farms/:farmId/checkups/recent', livestockHealthController.getRecentCheckups.bind(livestockHealthController));

// Upcoming dewormings for farm
router.get('/farms/:farmId/dewormings/upcoming', livestockHealthController.getUpcomingDewormings.bind(livestockHealthController));

// Bulk deworming records for a farm (quick action)
router.post('/farms/:farmId/dewormings/bulk', livestockHealthController.addBulkDewormings.bind(livestockHealthController));

// ==================== RECORD MANAGEMENT ====================

// Update/delete vaccination
router.put('/vaccinations/:vaccinationId', livestockHealthController.updateVaccination.bind(livestockHealthController));
router.delete('/vaccinations/:vaccinationId', livestockHealthController.deleteVaccination.bind(livestockHealthController));

// Update/delete treatment
router.put('/treatments/:treatmentId', livestockHealthController.updateTreatment.bind(livestockHealthController));
router.delete('/treatments/:treatmentId', livestockHealthController.deleteTreatment.bind(livestockHealthController));

// Update illness
router.put('/illnesses/:illnessId', livestockHealthController.updateIllness.bind(livestockHealthController));

export default router;
