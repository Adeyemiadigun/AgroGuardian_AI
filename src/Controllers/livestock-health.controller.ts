import { Request, Response, NextFunction } from 'express';
import { livestockHealthService } from '../Services/livestock-health.service';
import { Types } from 'mongoose';

const getSingleString = (value: unknown): string | undefined => {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined;
  return typeof value === 'string' ? value : undefined;
};

const badRequest = (res: Response, message: string) =>
  res.status(400).json({ success: false, message });

const getDaysQuery = (req: Request, fallback = 30) => {
  const raw = getSingleString((req.query as any)?.days);
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export class LivestockHealthController {
  // ==================== VACCINATIONS ====================

  async addVaccination(req: Request, res: Response, next: NextFunction) {
    try {
      const livestockId = getSingleString((req.params as any).livestockId);
      const userId = (req as any).userId;

      if (!livestockId) return badRequest(res, 'livestockId is required');

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
      const livestockId = getSingleString((req.params as any).livestockId);
      if (!livestockId) return badRequest(res, 'livestockId is required');
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
      const farmId = getSingleString((req.params as any).farmId);
      const days = getDaysQuery(req, 30);
      
      if (!farmId) return badRequest(res, 'farmId is required');
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
      const vaccinationId = getSingleString((req.params as any).vaccinationId);
      if (!vaccinationId) return badRequest(res, 'vaccinationId is required');
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
      const vaccinationId = getSingleString((req.params as any).vaccinationId);
      if (!vaccinationId) return badRequest(res, 'vaccinationId is required');
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
      const livestockId = getSingleString((req.params as any).livestockId);
      const userId = (req as any).userId;

      if (!livestockId) return badRequest(res, 'livestockId is required');

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
      const livestockId = getSingleString((req.params as any).livestockId);
      if (!livestockId) return badRequest(res, 'livestockId is required');
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
      const farmId = getSingleString((req.params as any).farmId);
      if (!farmId) return badRequest(res, 'farmId is required');
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
      const treatmentId = getSingleString((req.params as any).treatmentId);
      if (!treatmentId) return badRequest(res, 'treatmentId is required');
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
      const treatmentId = getSingleString((req.params as any).treatmentId);
      if (!treatmentId) return badRequest(res, 'treatmentId is required');
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
      const livestockId = getSingleString((req.params as any).livestockId);
      const userId = (req as any).userId;
      const files = (req as any).files as Express.Multer.File[] | undefined;

      if (!livestockId) return badRequest(res, 'livestockId is required');

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
      const livestockId = getSingleString((req.params as any).livestockId);
      if (!livestockId) return badRequest(res, 'livestockId is required');
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
      const farmId = getSingleString((req.params as any).farmId);
      if (!farmId) return badRequest(res, 'farmId is required');
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
      const illnessId = getSingleString((req.params as any).illnessId);
      if (!illnessId) return badRequest(res, 'illnessId is required');
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
      const livestockId = getSingleString((req.params as any).livestockId);
      const userId = (req as any).userId;

      if (!livestockId) return badRequest(res, 'livestockId is required');

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
      const livestockId = getSingleString((req.params as any).livestockId);
      if (!livestockId) return badRequest(res, 'livestockId is required');
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
      const farmId = getSingleString((req.params as any).farmId);
      const days = getDaysQuery(req, 30);
      
      if (!farmId) return badRequest(res, 'farmId is required');
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
      const livestockId = getSingleString((req.params as any).livestockId);
      const userId = (req as any).userId;

      if (!livestockId) return badRequest(res, 'livestockId is required');

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
      const livestockId = getSingleString((req.params as any).livestockId);
      if (!livestockId) return badRequest(res, 'livestockId is required');
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
      const farmId = getSingleString((req.params as any).farmId);
      const days = getDaysQuery(req, 30);
      
      if (!farmId) return badRequest(res, 'farmId is required');
      const dewormings = await livestockHealthService.getUpcomingDewormings(farmId, days);

      res.json({
        success: true,
        data: dewormings
      });
    } catch (error) {
      next(error);
    }
  }

  async addBulkDewormings(req: Request, res: Response, next: NextFunction) {
    try {
      const farmId = getSingleString((req.params as any).farmId);
      const userId = (req as any).userId;
      if (!farmId) return badRequest(res, 'farmId is required');

      const scope = (req.body?.scope || 'all') as 'all' | 'species' | 'selected';
      if (!['all', 'species', 'selected'].includes(scope)) {
        return badRequest(res, 'scope must be one of: all, species, selected');
      }

      const productName = typeof req.body?.productName === 'string' ? req.body.productName.trim() : '';
      const dosage = typeof req.body?.dosage === 'string' ? req.body.dosage.trim() : '';
      const dateAdministeredRaw = req.body?.dateAdministered;

      if (!productName) return badRequest(res, 'productName is required');
      if (!dosage) return badRequest(res, 'dosage is required');
      if (!dateAdministeredRaw) return badRequest(res, 'dateAdministered is required');

      const dateAdministered = new Date(dateAdministeredRaw);
      if (Number.isNaN(dateAdministered.getTime())) {
        return badRequest(res, 'dateAdministered must be a valid date');
      }

      const nextDueDateRaw = req.body?.nextDueDate;
      const nextDueDate = nextDueDateRaw ? new Date(nextDueDateRaw) : undefined;
      if (nextDueDateRaw && nextDueDate && Number.isNaN(nextDueDate.getTime())) {
        return badRequest(res, 'nextDueDate must be a valid date');
      }

      const costRaw = req.body?.cost;
      const cost = costRaw === undefined || costRaw === null || costRaw === '' ? undefined : Number(costRaw);
      if (costRaw !== undefined && costRaw !== null && costRaw !== '' && !Number.isFinite(cost as number)) {
        return badRequest(res, 'cost must be a valid number');
      }

      const species = Array.isArray(req.body?.species) ? req.body.species : undefined;
      const livestockIds = Array.isArray(req.body?.livestockIds) ? req.body.livestockIds : undefined;
      const targetParasites = Array.isArray(req.body?.targetParasites) ? req.body.targetParasites : undefined;

      const result = await livestockHealthService.addBulkDewormings({
        farmId,
        userId,
        scope,
        species,
        livestockIds,
        productName,
        activeIngredient: req.body?.activeIngredient,
        dosage,
        dateAdministered,
        nextDueDate,
        targetParasites,
        cost,
        notes: req.body?.notes
      });

      res.status(201).json({
        success: true,
        message: result.createdCount > 0 ? 'Bulk deworming records added successfully' : 'No eligible livestock found for the selected scope',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  // ==================== HEALTH SUMMARY ====================

  async getHealthSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const farmId = getSingleString((req.params as any).farmId);
      if (!farmId) return badRequest(res, 'farmId is required');
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
      const livestockId = getSingleString((req.params as any).livestockId);
      if (!livestockId) return badRequest(res, 'livestockId is required');
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
