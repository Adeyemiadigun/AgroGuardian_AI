import { Request, Response, NextFunction } from 'express';
import { livestockHealthService } from '../Services/livestock-health.service';
import { Types } from 'mongoose';

export class LivestockHealthController {
  // ==================== VACCINATIONS ====================

  async addVaccination(req: Request, res: Response, next: NextFunction) {
    try {
      const { livestockId } = req.params;
      const userId = (req as any).userId;

      const vaccination = await livestockHealthService.addVaccination({
        ...req.body,
        livestockId,
        userId
      });

      res.status(201).json({
        success: true,
        message: 'Vaccination record added successfully',
        data: vaccination
      });
    } catch (error) {
      next(error);
    }
  }

  async getVaccinations(req: Request, res: Response, next: NextFunction) {
    try {
      const { livestockId } = req.params;
      const vaccinations = await livestockHealthService.getVaccinations(livestockId);

      res.json({
        success: true,
        data: vaccinations
      });
    } catch (error) {
      next(error);
    }
  }

  async getUpcomingVaccinations(req: Request, res: Response, next: NextFunction) {
    try {
      const { farmId } = req.params;
      const days = parseInt(req.query.days as string) || 30;
      
      const vaccinations = await livestockHealthService.getUpcomingVaccinations(farmId, days);

      res.json({
        success: true,
        data: vaccinations
      });
    } catch (error) {
      next(error);
    }
  }

  async updateVaccination(req: Request, res: Response, next: NextFunction) {
    try {
      const { vaccinationId } = req.params;
      const vaccination = await livestockHealthService.updateVaccination(vaccinationId, req.body);

      if (!vaccination) {
        return res.status(404).json({
          success: false,
          message: 'Vaccination record not found'
        });
      }

      res.json({
        success: true,
        message: 'Vaccination record updated',
        data: vaccination
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteVaccination(req: Request, res: Response, next: NextFunction) {
    try {
      const { vaccinationId } = req.params;
      const deleted = await livestockHealthService.deleteVaccination(vaccinationId);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: 'Vaccination record not found'
        });
      }

      res.json({
        success: true,
        message: 'Vaccination record deleted'
      });
    } catch (error) {
      next(error);
    }
  }

  // ==================== TREATMENTS ====================

  async addTreatment(req: Request, res: Response, next: NextFunction) {
    try {
      const { livestockId } = req.params;
      const userId = (req as any).userId;

      const treatment = await livestockHealthService.addTreatment({
        ...req.body,
        livestockId,
        userId
      });

      res.status(201).json({
        success: true,
        message: 'Treatment record added successfully',
        data: treatment
      });
    } catch (error) {
      next(error);
    }
  }

  async getTreatments(req: Request, res: Response, next: NextFunction) {
    try {
      const { livestockId } = req.params;
      const treatments = await livestockHealthService.getTreatments(livestockId);

      res.json({
        success: true,
        data: treatments
      });
    } catch (error) {
      next(error);
    }
  }

  async getActiveTreatments(req: Request, res: Response, next: NextFunction) {
    try {
      const { farmId } = req.params;
      const treatments = await livestockHealthService.getActiveTreatments(farmId);

      res.json({
        success: true,
        data: treatments
      });
    } catch (error) {
      next(error);
    }
  }

  async updateTreatment(req: Request, res: Response, next: NextFunction) {
    try {
      const { treatmentId } = req.params;
      const treatment = await livestockHealthService.updateTreatment(treatmentId, req.body);

      if (!treatment) {
        return res.status(404).json({
          success: false,
          message: 'Treatment record not found'
        });
      }

      res.json({
        success: true,
        message: 'Treatment record updated',
        data: treatment
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteTreatment(req: Request, res: Response, next: NextFunction) {
    try {
      const { treatmentId } = req.params;
      const deleted = await livestockHealthService.deleteTreatment(treatmentId);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: 'Treatment record not found'
        });
      }

      res.json({
        success: true,
        message: 'Treatment record deleted'
      });
    } catch (error) {
      next(error);
    }
  }

  // ==================== ILLNESSES ====================

  async reportIllness(req: Request, res: Response, next: NextFunction) {
    try {
      const { livestockId } = req.params;
      const userId = (req as any).userId;
      const files = (req as any).files as Express.Multer.File[] | undefined;

      // Parse symptoms if it comes as a JSON string or array
      let symptoms = req.body.symptoms;
      if (typeof symptoms === 'string') {
        try {
          symptoms = JSON.parse(symptoms);
        } catch {
          // Treat as comma-separated string
          symptoms = symptoms.split(',').map((s: string) => s.trim()).filter(Boolean);
        }
      }

      // Parse affectedCount if provided
      let affectedCount = req.body.affectedCount;
      if (affectedCount) {
        affectedCount = parseInt(affectedCount, 10);
        if (isNaN(affectedCount) || affectedCount < 1) {
          affectedCount = undefined;
        }
      }

      const illness = await livestockHealthService.reportIllness(
        {
          ...req.body,
          symptoms,
          affectedCount,
          livestockId,
          userId
        },
        files
      );

      res.status(201).json({
        success: true,
        message: 'Illness reported successfully',
        data: illness
      });
    } catch (error) {
      next(error);
    }
  }

  async getIllnesses(req: Request, res: Response, next: NextFunction) {
    try {
      const { livestockId } = req.params;
      const illnesses = await livestockHealthService.getIllnesses(livestockId);

      res.json({
        success: true,
        data: illnesses
      });
    } catch (error) {
      next(error);
    }
  }

  async getActiveIllnesses(req: Request, res: Response, next: NextFunction) {
    try {
      const { farmId } = req.params;
      const illnesses = await livestockHealthService.getActiveIllnesses(farmId);

      res.json({
        success: true,
        data: illnesses
      });
    } catch (error) {
      next(error);
    }
  }

  async updateIllness(req: Request, res: Response, next: NextFunction) {
    try {
      const { illnessId } = req.params;
      const illness = await livestockHealthService.updateIllness(illnessId, req.body);

      if (!illness) {
        return res.status(404).json({
          success: false,
          message: 'Illness record not found'
        });
      }

      res.json({
        success: true,
        message: 'Illness record updated',
        data: illness
      });
    } catch (error) {
      next(error);
    }
  }

  // ==================== CHECKUPS ====================

  async addCheckup(req: Request, res: Response, next: NextFunction) {
    try {
      const { livestockId } = req.params;
      const userId = (req as any).userId;

      const checkup = await livestockHealthService.addCheckup({
        ...req.body,
        livestockId,
        userId
      });

      res.status(201).json({
        success: true,
        message: 'Checkup recorded successfully',
        data: checkup
      });
    } catch (error) {
      next(error);
    }
  }

  async getCheckups(req: Request, res: Response, next: NextFunction) {
    try {
      const { livestockId } = req.params;
      const checkups = await livestockHealthService.getCheckups(livestockId);

      res.json({
        success: true,
        data: checkups
      });
    } catch (error) {
      next(error);
    }
  }

  async getRecentCheckups(req: Request, res: Response, next: NextFunction) {
    try {
      const { farmId } = req.params;
      const days = parseInt(req.query.days as string) || 30;
      
      const checkups = await livestockHealthService.getRecentCheckups(farmId, days);

      res.json({
        success: true,
        data: checkups
      });
    } catch (error) {
      next(error);
    }
  }

  // ==================== DEWORMING ====================

  async addDeworming(req: Request, res: Response, next: NextFunction) {
    try {
      const { livestockId } = req.params;
      const userId = (req as any).userId;

      const deworming = await livestockHealthService.addDeworming({
        ...req.body,
        livestockId,
        userId
      });

      res.status(201).json({
        success: true,
        message: 'Deworming record added successfully',
        data: deworming
      });
    } catch (error) {
      next(error);
    }
  }

  async getDewormings(req: Request, res: Response, next: NextFunction) {
    try {
      const { livestockId } = req.params;
      const dewormings = await livestockHealthService.getDewormings(livestockId);

      res.json({
        success: true,
        data: dewormings
      });
    } catch (error) {
      next(error);
    }
  }

  async getUpcomingDewormings(req: Request, res: Response, next: NextFunction) {
    try {
      const { farmId } = req.params;
      const days = parseInt(req.query.days as string) || 30;
      
      const dewormings = await livestockHealthService.getUpcomingDewormings(farmId, days);

      res.json({
        success: true,
        data: dewormings
      });
    } catch (error) {
      next(error);
    }
  }

  // ==================== HEALTH SUMMARY ====================

  async getHealthSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const { farmId } = req.params;
      const summary = await livestockHealthService.getHealthSummary(farmId);

      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      next(error);
    }
  }

  async getAllHealthRecords(req: Request, res: Response, next: NextFunction) {
    try {
      const { livestockId } = req.params;
      const records = await livestockHealthService.getAllHealthRecords(livestockId);

      res.json({
        success: true,
        data: records
      });
    } catch (error) {
      next(error);
    }
  }
}

export const livestockHealthController = new LivestockHealthController();
