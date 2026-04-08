import { Router } from 'express';
import { verifyAccessToken } from '../Middlewares/auth.middleware';
import { livestockFeedBreedingController } from '../Controllers/livestock-feed-breeding.controller';

const router = Router();

// All routes require authentication
router.use('/', verifyAccessToken as any);

// ==================== FEEDING ROUTES ====================

// Add feeding record to farm
router.post(
  '/farms/:farmId/feeding',
  livestockFeedBreedingController.addFeedingRecord.bind(livestockFeedBreedingController)
);

// Get feeding records for farm
router.get(
  '/farms/:farmId/feeding',
  livestockFeedBreedingController.getFeedingRecords.bind(livestockFeedBreedingController)
);

// Get feeding schedules for farm
router.get(
  '/farms/:farmId/feeding/schedules',
  livestockFeedBreedingController.getFeedingSchedules.bind(livestockFeedBreedingController)
);

// Get feed consumption stats
router.get(
  '/farms/:farmId/feeding/stats',
  livestockFeedBreedingController.getFeedConsumptionStats.bind(livestockFeedBreedingController)
);

// Update feeding record
router.put(
  '/feeding/:feedingId',
  livestockFeedBreedingController.updateFeedingRecord.bind(livestockFeedBreedingController)
);

// Delete feeding record
router.delete(
  '/feeding/:feedingId',
  livestockFeedBreedingController.deleteFeedingRecord.bind(livestockFeedBreedingController)
);

// ==================== BREEDING ROUTES ====================

// Add breeding record to farm
router.post(
  '/farms/:farmId/breeding',
  livestockFeedBreedingController.addBreedingRecord.bind(livestockFeedBreedingController)
);

// Get breeding records for farm
router.get(
  '/farms/:farmId/breeding',
  livestockFeedBreedingController.getBreedingRecords.bind(livestockFeedBreedingController)
);

// Get active pregnancies
router.get(
  '/farms/:farmId/breeding/pregnancies',
  livestockFeedBreedingController.getActivePregnancies.bind(livestockFeedBreedingController)
);

// Get upcoming births
router.get(
  '/farms/:farmId/breeding/upcoming-births',
  livestockFeedBreedingController.getUpcomingBirths.bind(livestockFeedBreedingController)
);

// Get breeding stats
router.get(
  '/farms/:farmId/breeding/stats',
  livestockFeedBreedingController.getBreedingStats.bind(livestockFeedBreedingController)
);

// Update breeding record
router.put(
  '/breeding/:breedingId',
  livestockFeedBreedingController.updateBreedingRecord.bind(livestockFeedBreedingController)
);

router.post(
  '/breeding/:breedingId/birth',
  livestockFeedBreedingController.recordBirth.bind(livestockFeedBreedingController)
);

router.delete(
  '/breeding/:breedingId',
  livestockFeedBreedingController.deleteBreedingRecord.bind(livestockFeedBreedingController)
);

export default router;
