import { isRedisQueueEnabled } from '../Config/queueMode';
import { enqueueJob } from './agroJobs.queue';
import logger from '../Utils/logger';
import { livestockHealthCheckService } from '../Services/livestock-health-check.service';

// Kept for backward compatibility (previously the BullMQ queue name).
export const LIVESTOCK_HEALTHCHECK_QUEUE = 'livestock-healthcheck-queue';

export const addLivestockHealthCheckJob = async (data: { livestockId: string; reason?: string }) => {
  if (!isRedisQueueEnabled()) return;

  const result = await enqueueJob(
    'process-livestock-healthcheck',
    data as unknown as Record<string, unknown>,
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
    },
    async () => {
      await livestockHealthCheckService.recompute(data.livestockId, { reason: data.reason, useAI: true });
    }
  );

  if (result.status === 'queued') {
    logger.debug(`Livestock health-check job added for livestockId: ${data.livestockId}`);
  }
};
