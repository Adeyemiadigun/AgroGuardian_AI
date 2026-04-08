import type { Response } from 'express';
import type { AuthRequest } from '../Types/auth.types';
import logger from '../Utils/logger';
import Livestock from '../Models/Livestock';
import { livestockHealthCheckService } from '../Services/livestock-health-check.service';
import { addLivestockHealthCheckJob } from '../Queues/livestockHealthCheck.queue';

export const getLivestockHealthCheckController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { livestockId } = req.params;
    const userId = req.user!.userId as string;

    const report = await livestockHealthCheckService.getLatestReport(livestockId, userId);

    res.status(200).json({
      success: true,
      message: 'Health-check report retrieved successfully',
      data: report,
    });
  } catch (error: any) {
    logger.error('Error retrieving health-check report', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to retrieve health-check report',
    });
  }
};

export const recomputeLivestockHealthCheckController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { livestockId } = req.params;
    const userId = req.user!.userId as string;

    const owned = await Livestock.findOne({ _id: livestockId, owner: userId }).select('_id');
    if (!owned) {
      throw new Error('Livestock not found or you do not have permission');
    }

    // Recompute rule-based immediately, then queue AI enhancement.
    await livestockHealthCheckService.recompute(livestockId, { reason: 'manual_recompute', useAI: false });
    await addLivestockHealthCheckJob({ livestockId, reason: 'manual_recompute' });

    res.status(202).json({
      success: true,
      message: 'Health-check recompute queued',
      data: { livestockId },
    });
  } catch (error: any) {
    logger.error('Error queuing health-check recompute', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to queue health-check recompute',
    });
  }
};
