import { Request, Response, NextFunction } from 'express';
import { livestockInventoryService } from '../Services/livestock-inventory.service';

export class LivestockInventoryController {
  async addTransaction(req: Request, res: Response, next: NextFunction) {
    try {
      const { farmId } = req.params;
      const userId = (req as any).userId;

      const transaction = await livestockInventoryService.addTransaction({
        ...req.body,
        farmId,
        userId
      });

      res.status(201).json({
        success: true,
        message: 'Transaction recorded',
        data: transaction
      });
    } catch (error) {
      next(error);
    }
  }

  async getTransactions(req: Request, res: Response, next: NextFunction) {
    try {
      const { farmId } = req.params;
      const { type, species, startDate, endDate, limit } = req.query;

      const transactions = await livestockInventoryService.getTransactions(farmId, {
        type: type as string,
        species: species as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined
      });

      res.json({
        success: true,
        data: transactions
      });
    } catch (error) {
      next(error);
    }
  }

  async getInventorySummary(req: Request, res: Response, next: NextFunction) {
    try {
      const { farmId } = req.params;
      const summary = await livestockInventoryService.getInventorySummary(farmId);

      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      next(error);
    }
  }

  async getMortalityReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { farmId } = req.params;
      const days = parseInt(req.query.days as string) || 90;

      const report = await livestockInventoryService.getMortalityReport(farmId, days);

      res.json({
        success: true,
        data: report
      });
    } catch (error) {
      next(error);
    }
  }

  async getFinancialSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const { farmId } = req.params;
      const year = req.query.year ? parseInt(req.query.year as string) : undefined;

      const summary = await livestockInventoryService.getFinancialSummary(farmId, year);

      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      next(error);
    }
  }

  async updateTransaction(req: Request, res: Response, next: NextFunction) {
    try {
      const { transactionId } = req.params;
      const transaction = await livestockInventoryService.updateTransaction(transactionId, req.body);

      if (!transaction) {
        return res.status(404).json({ success: false, message: 'Transaction not found' });
      }

      res.json({
        success: true,
        message: 'Transaction updated',
        data: transaction
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteTransaction(req: Request, res: Response, next: NextFunction) {
    try {
      const { transactionId } = req.params;
      const deleted = await livestockInventoryService.deleteTransaction(transactionId);

      if (!deleted) {
        return res.status(404).json({ success: false, message: 'Transaction not found' });
      }

      res.json({ success: true, message: 'Transaction deleted' });
    } catch (error) {
      next(error);
    }
  }
}

export const livestockInventoryController = new LivestockInventoryController();
