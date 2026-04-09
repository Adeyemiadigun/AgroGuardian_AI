import { Request, Response, NextFunction } from 'express';
import { vetConsultationService } from '../Services/vet-consultation.service';

export class VetConsultationController {
  async startConsultation(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).userId;
      const { farmId, livestockId, species, message } = req.body;

      if (!farmId || !species || !message) {
        return res.status(400).json({
          success: false,
          message: 'farmId, species, and message are required'
        });
      }

      // Get image buffers if uploaded
      const files = req.files as Express.Multer.File[] | undefined;
      const imageBuffers = files?.map(f => f.buffer);

      const consultation = await vetConsultationService.startConsultation({
        farmId,
        userId,
        livestockId,
        species,
        initialMessage: message,
        imageBuffers
      });

      res.status(201).json({
        success: true,
        message: 'Consultation started',
        data: consultation
      });
    } catch (error) {
      next(error);
    }
  }

  async sendMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const { consultationId } = req.params;
      const userId = (req as any).userId;
      const { message } = req.body;

      if (!message) {
        return res.status(400).json({
          success: false,
          message: 'Message is required'
        });
      }

      // Get image buffers if uploaded
      const files = req.files as Express.Multer.File[] | undefined;
      const imageBuffers = files?.map(f => f.buffer);

      const result = await vetConsultationService.sendMessage(
        consultationId,
        userId,
        message,
        imageBuffers
      );

      res.json({
        success: true,
        data: {
          userMessage: message,
          aiResponse: result.aiResponse,
          aiStructured: (result as any).aiStructured,
          aiReasoningDetails: (result as any).aiReasoningDetails,
          totalMessages: result.consultation.messages.length
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async getConsultation(req: Request, res: Response, next: NextFunction) {
    try {
      const { consultationId } = req.params;
      const userId = (req as any).userId;

      const consultation = await vetConsultationService.getConsultation(consultationId, userId);

      if (!consultation) {
        return res.status(404).json({
          success: false,
          message: 'Consultation not found'
        });
      }

      res.json({
        success: true,
        data: consultation
      });
    } catch (error) {
      next(error);
    }
  }

  async getConsultations(req: Request, res: Response, next: NextFunction) {
    try {
      const { farmId } = req.params;
      const { status, livestockId, limit } = req.query;

      const consultations = await vetConsultationService.getConsultations(farmId, {
        status: status as string,
        livestockId: livestockId as string,
        limit: limit ? parseInt(limit as string) : undefined
      });

      res.json({
        success: true,
        data: consultations
      });
    } catch (error) {
      next(error);
    }
  }

  async updateConsultation(req: Request, res: Response, next: NextFunction) {
    try {
      const { consultationId } = req.params;
      const userId = (req as any).userId;
      const { status, title, summary, issueType, severity } = req.body;

      const consultation = await vetConsultationService.updateConsultation(
        consultationId,
        userId,
        { status, title, summary, issueType, severity }
      );

      if (!consultation) {
        return res.status(404).json({
          success: false,
          message: 'Consultation not found'
        });
      }

      res.json({
        success: true,
        message: 'Consultation updated',
        data: consultation
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteConsultation(req: Request, res: Response, next: NextFunction) {
    try {
      const { consultationId } = req.params;
      const userId = (req as any).userId;

      const deleted = await vetConsultationService.deleteConsultation(consultationId, userId);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: 'Consultation not found'
        });
      }

      res.json({
        success: true,
        message: 'Consultation deleted'
      });
    } catch (error) {
      next(error);
    }
  }
}

export const vetConsultationController = new VetConsultationController();
