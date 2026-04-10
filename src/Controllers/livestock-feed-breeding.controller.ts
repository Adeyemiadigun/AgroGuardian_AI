import { Request, Response, NextFunction } from 'express';
import { livestockFeedBreedingService } from '../Services/livestock-feed-breeding.service';
import { createFeedingScheduleSchema, updateFeedingScheduleSchema } from '../Validators/livestock.validator';

export class LivestockFeedBreedingController {
  // ==================== FEEDING ====================

  async addFeedingRecord(req: Request, res: Response, next: NextFunction) {
    try {
      const farmId = req.params.farmId as string;
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
      const farmId = req.params.farmId as string;
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

  async createFeedingSchedule(req: Request, res: Response, next: NextFunction) {
    try {
      const farmId = req.params.farmId as string;
      const userId = (req as any).userId;

      const validationResult = createFeedingScheduleSchema.safeParse(req.body);
      if (!validationResult.success) {
        const errors = validationResult.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        }));
        return res.status(400).json({ success: false, message: 'Validation failed', errors });
      }

      const schedule = await livestockFeedBreedingService.createFeedingSchedule({
        ...(validationResult.data as any),
        farmId: farmId as any,
        userId,
      });

      res.status(201).json({
        success: true,
        message: 'Feeding schedule created',
        data: schedule,
      });
    } catch (error) {
      next(error);
    }
  }

  async getFeedingSchedules(req: Request, res: Response, next: NextFunction) {
    try {
      const farmId = req.params.farmId as string;
      const userId = (req as any).userId;

      const schedules = await livestockFeedBreedingService.getFeedingSchedules(farmId, userId);

      res.json({
        success: true,
        data: schedules,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateFeedingSchedule(req: Request, res: Response, next: NextFunction) {
    try {
      const scheduleId = req.params.scheduleId as string;
      const userId = (req as any).userId;

      const validationResult = updateFeedingScheduleSchema.safeParse(req.body);
      if (!validationResult.success) {
        const errors = validationResult.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        }));
        return res.status(400).json({ success: false, message: 'Validation failed', errors });
      }

      const schedule = await livestockFeedBreedingService.updateFeedingSchedule(scheduleId, userId, validationResult.data as any);
      if (!schedule) {
        return res.status(404).json({ success: false, message: 'Feeding schedule not found' });
      }

      res.json({
        success: true,
        message: 'Feeding schedule updated',
        data: schedule,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteFeedingSchedule(req: Request, res: Response, next: NextFunction) {
    try {
      const scheduleId = req.params.scheduleId as string;
      const userId = (req as any).userId;

      const deleted = await livestockFeedBreedingService.deleteFeedingSchedule(scheduleId, userId);
      if (!deleted) {
        return res.status(404).json({ success: false, message: 'Feeding schedule not found' });
      }

      res.json({ success: true, message: 'Feeding schedule deleted' });
    } catch (error) {
      next(error);
    }
  }

  async getFeedConsumptionStats(req: Request, res: Response, next: NextFunction) {
    try {
      const farmId = req.params.farmId as string;
      const days = parseInt((String(req.query.days)) as string) || 30;

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
      const feedingId = req.params.feedingId as string;
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
      const feedingId = req.params.feedingId as string;
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
      const farmId = req.params.farmId as string;
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
    } catch (error: any) {
      if (error?.status === 409) {
        return res.status(409).json({
          success: false,
          message: error?.message || 'Breeding is not allowed yet',
          reason: error?.reason,
          nextEligibleDate: error?.nextEligibleDate,
        });
      }

      // Convert schema validation issues into a client error instead of a 500
      if (error?.name === 'ValidationError' || String(error?.message || '').toLowerCase().includes('damid')) {
        return res.status(400).json({
          success: false,
          message: error?.message || 'Invalid breeding record data',
        });
      }
      next(error);
    }
  }

  async getBreedingRecords(req: Request, res: Response, next: NextFunction) {
    try {
      const farmId = req.params.farmId as string;
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
      const farmId = req.params.farmId as string;
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
      const farmId = req.params.farmId as string;
      const days = parseInt((String(req.query.days)) as string) || 30;

      const births = await livestockFeedBreedingService.getUpcomingBirths(farmId, days);

      res.json({
        success: true,
        data: births
      });
    } catch (error) {
      next(error);
    }
  }

  async confirmPregnancy(req: Request, res: Response, next: NextFunction) {
    try {
      const breedingId = req.params.breedingId as string;
      const record = await livestockFeedBreedingService.confirmPregnancy(breedingId, req.body || {});

      if (!record) {
        return res.status(404).json({ success: false, message: 'Breeding record not found' });
      }

      res.json({
        success: true,
        message: 'Pregnancy confirmed',
        data: record
      });
    } catch (error) {
      next(error);
    }
  }

  async getBreedingFollowUps(req: Request, res: Response, next: NextFunction) {
    try {
      const breedingId = req.params.breedingId as string;
      const followUps = await livestockFeedBreedingService.getBreedingFollowUps(breedingId);

      res.json({
        success: true,
        data: followUps
      });
    } catch (error) {
      next(error);
    }
  }

  async updateBreedingFollowUp(req: Request, res: Response, next: NextFunction) {
    try {
      const breedingId = req.params.breedingId as string;
      const followUpId = req.params.followUpId as string;
      const updated = await livestockFeedBreedingService.updateBreedingFollowUp(breedingId, followUpId, req.body || {});

      if (!updated) {
        return res.status(404).json({ success: false, message: 'Follow-up not found' });
      }

      res.json({
        success: true,
        message: 'Follow-up updated',
        data: updated
      });
    } catch (error) {
      next(error);
    }
  }

  async updateBreedingRecord(req: Request, res: Response, next: NextFunction) {
    try {
      const breedingId = req.params.breedingId as string;
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
      const breedingId = req.params.breedingId as string;
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
      const farmId = req.params.farmId as string;
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
      const breedingId = req.params.breedingId as string;
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
