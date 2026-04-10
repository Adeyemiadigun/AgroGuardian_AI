import { Request, Response, NextFunction } from 'express';
import { livestockDiagnosisService } from '../Services/livestock-diagnosis.service';

export class LivestockDiagnosisController {
  /**
   * Create a new livestock diagnosis
   */
  async createDiagnosis(req: Request, res: Response, next: NextFunction) {
    try {
      const livestockId = (req.params.livestockId as string) as string;
      const userId = (req as any).userId as string;
      const { symptoms, affectedCount } = req.body;
      
      // Get image buffers from uploaded files
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one image is required for diagnosis'
        });
      }

      const imageBuffers = files.map(f => f.buffer);
      
      // Parse affectedCount if provided
      let parsedAffectedCount: number | undefined;
      if (affectedCount) {
        const countStr = Array.isArray(affectedCount) ? affectedCount[0] : affectedCount;
        parsedAffectedCount = parseInt(countStr, 10);
        if (isNaN(parsedAffectedCount) || parsedAffectedCount < 1) {
          parsedAffectedCount = undefined;
        }
      }

      const diagnosis = await livestockDiagnosisService.createDiagnosis(
        livestockId,
        userId,
        imageBuffers,
        symptoms ? (Array.isArray(symptoms) ? symptoms : [symptoms]) : undefined,
        parsedAffectedCount
      );

      res.status(201).json({
        success: true,
        message: 'Diagnosis initiated. Processing will complete shortly.',
        data: diagnosis
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get diagnosis by ID
   */
  async getDiagnosis(req: Request, res: Response, next: NextFunction) {
    try {
      const diagnosisId = (req.params.diagnosisId as string) as string;
      const userId = (req as any).userId as string;

      const diagnosis = await livestockDiagnosisService.getDiagnosis(diagnosisId, userId);

      res.json({
        success: true,
        data: diagnosis
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all diagnoses for a livestock
   */
  async getDiagnosesByLivestock(req: Request, res: Response, next: NextFunction) {
    try {
      const livestockId = (req.params.livestockId as string) as string;

      const diagnoses = await livestockDiagnosisService.getDiagnosesByLivestock(livestockId);

      res.json({
        success: true,
        data: diagnoses
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all diagnoses for a farm
   */
  async getDiagnosesByFarm(req: Request, res: Response, next: NextFunction) {
    try {
      const farmId = (req.params.farmId as string) as string;
      const { status, limit } = req.query;

      const diagnoses = await livestockDiagnosisService.getDiagnosesByFarm(farmId, {
        status: status as string,
        limit: limit ? parseInt(limit as string) : undefined
      });

      res.json({
        success: true,
        data: diagnoses
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Chat about a diagnosis
   */
  async chatAboutDiagnosis(req: Request, res: Response, next: NextFunction) {
    try {
      const diagnosisId = (req.params.diagnosisId as string) as string;
      const userId = (req as any).userId as string;
      const { message } = req.body;

      if (!message) {
        return res.status(400).json({
          success: false,
          message: 'Message is required'
        });
      }

      const result = await livestockDiagnosisService.chatAboutDiagnosis(
        diagnosisId,
        userId,
        message as string
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get chat history for a diagnosis
   */
  async getChatHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const diagnosisId = (req.params.diagnosisId as string) as string;
      const userId = (req as any).userId as string;

      const history = await livestockDiagnosisService.getChatHistory(diagnosisId, userId);

      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update diagnosis status
   */
  async updateDiagnosisStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const diagnosisId = (req.params.diagnosisId as string) as string;
      const userId = (req as any).userId as string;

      const allowedStatuses = ['detected', 'treating', 'treated', 'resolved'] as const;
      type AllowedStatus = (typeof allowedStatuses)[number];

      const statusRaw = (req.body as any).status;
      const statusStr = Array.isArray(statusRaw) ? statusRaw[0] : statusRaw;

      if (typeof statusStr !== 'string' || !allowedStatuses.includes(statusStr as AllowedStatus)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status. Must be: detected, treating, treated, or resolved'
        });
      }

      const diagnosis = await livestockDiagnosisService.updateDiagnosisStatus(
        diagnosisId,
        userId,
        statusStr as AllowedStatus
      );

      res.json({
        success: true,
        message: 'Diagnosis status updated',
        data: diagnosis
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Toggle a treatment-plan task
   */
  async toggleTreatmentPlanTask(req: Request, res: Response, next: NextFunction) {
    try {
      const diagnosisId = (req.params.diagnosisId as string) as string;
      const taskId = (req.params.taskId as string) as string;
      const userId = (req as any).userId as string;

      const diagnosis = await livestockDiagnosisService.toggleTreatmentPlanTask(diagnosisId, userId, taskId);

      res.json({
        success: true,
        message: 'Treatment task updated',
        data: diagnosis,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const livestockDiagnosisController = new LivestockDiagnosisController();
