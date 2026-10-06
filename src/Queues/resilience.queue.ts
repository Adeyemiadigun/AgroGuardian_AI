import { isRedisQueueEnabled } from '../Config/queueMode';
import { enqueueJob } from './agroJobs.queue';
import logger from '../Utils/logger';
import { updateResilienceProfile } from '../Services/resilience.service';

// Kept for backward compatibility (previously the BullMQ queue name).
export const RESILIENCE_QUEUE = 'resilience-sync';

export const addResilienceSyncJob = async (farmId: string, userId: string) => {
  if (!isRedisQueueEnabled()) return;

  const result = await enqueueJob(
    'update-resilience-score',
    { farmId, userId },
    {
      jobId: `resilience-sync-${farmId}`,
      removeOnComplete: true,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    },
    async () => {
      await updateResilienceProfile(farmId, userId);
    }
  );

  if (result.status === 'queued') {
    logger.debug(`Resilience sync job added for farm ${farmId}`);
  }
};
