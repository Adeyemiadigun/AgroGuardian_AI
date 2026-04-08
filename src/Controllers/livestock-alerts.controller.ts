import { Request, Response, NextFunction } from 'express';
import { livestockAlertsService } from '../Services/livestock-alerts.service';

export class LivestockAlertsController {
  async getAllAlerts(req: Request, res: Response, next: NextFunction) {
    try {
      const { farmId } = req.params;
      const alerts = await livestockAlertsService.getAllAlerts(farmId);

      res.json({
        success: true,
        data: alerts
      });
    } catch (error) {
      next(error);
    }
  }

  async getVaccinationAlerts(req: Request, res: Response, next: NextFunction) {
    try {
      const { farmId } = req.params;
      const days = parseInt(req.query.days as string) || 7;
      
      const alerts = await livestockAlertsService.getVaccinationAlerts(farmId, days);

      res.json({
        success: true,
        data: alerts
      });
    } catch (error) {
      next(error);
    }
  }

  async getBreedingAlerts(req: Request, res: Response, next: NextFunction) {
    try {
      const { farmId } = req.params;
      const days = parseInt(req.query.days as string) || 30;
      
      const alerts = await livestockAlertsService.getBreedingAlerts(farmId, days);

      res.json({
        success: true,
        data: alerts
      });
    } catch (error) {
      next(error);
    }
  }

  async getHealthAlerts(req: Request, res: Response, next: NextFunction) {
    try {
      const { farmId } = req.params;
      const alerts = await livestockAlertsService.getHealthAlerts(farmId);

      res.json({
        success: true,
        data: alerts
      });
    } catch (error) {
      next(error);
    }
  }

  async getAlertSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const { farmId } = req.params;
      const summary = await livestockAlertsService.getAlertSummary(farmId);

      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      next(error);
    }
  }

  async triggerNotifications(req: Request, res: Response, next: NextFunction) {
    try {
      const { farmId } = req.params;
      const userId = (req as any).userId;

      const count = await livestockAlertsService.checkAndCreateNotifications(userId, farmId);

      res.json({
        success: true,
        message: `Created ${count} notifications`,
        data: { notificationsCreated: count }
      });
    } catch (error) {
      next(error);
    }
  }
}

export const livestockAlertsController = new LivestockAlertsController();
