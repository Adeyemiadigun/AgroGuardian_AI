import { Request, Response, NextFunction } from 'express';
import { livestockFeedBreedingService } from '../Services/livestock-feed-breeding.service';

export class LivestockFeedBreedingController {
  // ==================== FEEDING ====================

  async addFeedingRecord(req: Request, res: Response, next: NextFunction) {
    try {
      const { farmId } = req.params;
      const userId = (req as any).userId;

      const feeding = await livestockFeedBreedingService.addFeedingRecord({
        ...req.body,
        farmId,
        userId
      });

      res.status(201).json({
        success: true,
        message: 'Feeding record added',
        data: feeding
      });
    } catch (error) {
      next(error);
    }
  }

  async getFeedingRecords(req: Request, res: Response, next: NextFunction) {
    try {
      const { farmId } = req.params;
      const { livestockId, startDate, endDate, limit } = req.query;

      const records = await livestockFeedBreedingService.getFeedingRecords(farmId, {
        livestockId: livestockId as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined
      });

      res.json({
        success: true,
        data: records
      });
    } catch (error) {
      next(error);
    }
  }

  async getFeedingSchedules(req: Request, res: Response, next: NextFunction) {
    try {
      const { farmId } = req.params;
      const schedules = await livestockFeedBreedingService.getFeedingSchedules(farmId);

      res.json({
        success: true,
        data: schedules
      });
    } catch (error) {
      next(error);
    }
  }

  async getFeedConsumptionStats(req: Request, res: Response, next: NextFunction) {
    try {
      const { farmId } = req.params;
      const days = parseInt(req.query.days as string) || 30;

      const stats = await livestockFeedBreedingService.getFeedConsumptionStats(farmId, days);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      next(error);
    }
  }

  async updateFeedingRecord(req: Request, res: Response, next: NextFunction) {
    try {
      const { feedingId } = req.params;
      const record = await livestockFeedBreedingService.updateFeedingRecord(feedingId, req.body);

      if (!record) {
        return res.status(404).json({ success: false, message: 'Feeding record not found' });
      }

      res.json({
        success: true,
        message: 'Feeding record updated',
        data: record
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteFeedingRecord(req: Request, res: Response, next: NextFunction) {
    try {
      const { feedingId } = req.params;
      const deleted = await livestockFeedBreedingService.deleteFeedingRecord(feedingId);

      if (!deleted) {
        return res.status(404).json({ success: false, message: 'Feeding record not found' });
      }

      res.json({ success: true, message: 'Feeding record deleted' });
    } catch (error) {
      next(error);
    }
  }

  // ==================== BREEDING ====================

  async addBreedingRecord(req: Request, res: Response, next: NextFunction) {
    try {
      const { farmId } = req.params;
      const userId = (req as any).userId;

      const breeding = await livestockFeedBreedingService.addBreedingRecord({
        ...req.body,
        farmId,
        userId
      });

      res.status(201).json({
        success: true,
        message: 'Breeding record added',
        data: breeding
      });
    } catch (error) {
      next(error);
    }
  }

  async getBreedingRecords(req: Request, res: Response, next: NextFunction) {
    try {
      const { farmId } = req.params;
      const { livestockId, status, limit } = req.query;

      const records = await livestockFeedBreedingService.getBreedingRecords(farmId, {
        livestockId: livestockId as string,
        status: status as string,
        limit: limit ? parseInt(limit as string) : undefined
      });

      res.json({
        success: true,
        data: records
      });
    } catch (error) {
      next(error);
    }
  }

  async getActivePregnancies(req: Request, res: Response, next: NextFunction) {
    try {
      const { farmId } = req.params;
      const pregnancies = await livestockFeedBreedingService.getActivePregnancies(farmId);

      res.json({
        success: true,
        data: pregnancies
      });
    } catch (error) {
      next(error);
    }
  }

  async getUpcomingBirths(req: Request, res: Response, next: NextFunction) {
    try {
      const { farmId } = req.params;
      const days = parseInt(req.query.days as string) || 30;

      const births = await livestockFeedBreedingService.getUpcomingBirths(farmId, days);

      res.json({
        success: true,
        data: births
      });
    } catch (error) {
      next(error);
    }
  }

  async updateBreedingRecord(req: Request, res: Response, next: NextFunction) {
    try {
      const { breedingId } = req.params;
      const record = await livestockFeedBreedingService.updateBreedingRecord(breedingId, req.body);

      if (!record) {
        return res.status(404).json({ success: false, message: 'Breeding record not found' });
      }

      res.json({
        success: true,
        message: 'Breeding record updated',
        data: record
      });
    } catch (error) {
      next(error);
    }
  }

  async recordBirth(req: Request, res: Response, next: NextFunction) {
    try {
      const { breedingId } = req.params;
      const record = await livestockFeedBreedingService.recordBirth(breedingId, req.body);

      if (!record) {
        return res.status(404).json({ success: false, message: 'Breeding record not found' });
      }

      res.json({
        success: true,
        message: 'Birth recorded successfully',
        data: record
      });
    } catch (error) {
      next(error);
    }
  }

  async getBreedingStats(req: Request, res: Response, next: NextFunction) {
    try {
      const { farmId } = req.params;
      const stats = await livestockFeedBreedingService.getBreedingStats(farmId);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteBreedingRecord(req: Request, res: Response, next: NextFunction) {
    try {
      const { breedingId } = req.params;
      const deleted = await livestockFeedBreedingService.deleteBreedingRecord(breedingId);

      if (!deleted) {
        return res.status(404).json({ success: false, message: 'Breeding record not found' });
      }

      res.json({ success: true, message: 'Breeding record deleted' });
    } catch (error) {
      next(error);
    }
  }
}

export const livestockFeedBreedingController = new LivestockFeedBreedingController();
