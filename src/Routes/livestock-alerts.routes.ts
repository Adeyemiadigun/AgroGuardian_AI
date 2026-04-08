import { Router } from 'express';
import { verifyAccessToken } from '../Middlewares/auth.middleware';
import { livestockAlertsController } from '../Controllers/livestock-alerts.controller';

const router = Router();

// All routes require authentication
router.use('/', verifyAccessToken as any);

// Get all alerts for farm
router.get(
  '/farms/:farmId',
  livestockAlertsController.getAllAlerts.bind(livestockAlertsController)
);

// Get alert summary for dashboard
router.get(
  '/farms/:farmId/summary',
  livestockAlertsController.getAlertSummary.bind(livestockAlertsController)
);

// Get vaccination alerts
router.get(
  '/farms/:farmId/vaccinations',
  livestockAlertsController.getVaccinationAlerts.bind(livestockAlertsController)
);

// Get breeding/birth alerts
router.get(
  '/farms/:farmId/breeding',
  livestockAlertsController.getBreedingAlerts.bind(livestockAlertsController)
);

// Get health alerts (sick animals)
router.get(
  '/farms/:farmId/health',
  livestockAlertsController.getHealthAlerts.bind(livestockAlertsController)
);

// Trigger notification creation for critical alerts
router.post(
  '/farms/:farmId/notify',
  livestockAlertsController.triggerNotifications.bind(livestockAlertsController)
);

export default router;
