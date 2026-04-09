import { Queue } from 'bullmq';
import { redisConnection } from '../Config/redis';
import { isRedisQueueEnabled } from '../Config/queueMode';
import logger from '../Utils/logger';

export const RESILIENCE_QUEUE = 'resilience-sync';

let resilienceQueue: Queue | null = null;
const getResilienceQueue = () => {
  if (!resilienceQueue) {
    resilienceQueue = new Queue(RESILIENCE_QUEUE, {
      connection: redisConnection as any,
    });
  }
  return resilienceQueue;
};

export const addResilienceSyncJob = async (farmId: string, userId: string) => {
  if (!isRedisQueueEnabled()) return;

  try {
    const jobId = `resilience-sync-${farmId}`;

    await getResilienceQueue().add(
      'update-score',
      { farmId, userId },
      {
        jobId,
        removeOnComplete: true,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      }
    );

    logger.debug(`Resilience sync job added for farm ${farmId}`);
  } catch (error: any) {
    logger.error(`Failed to add job to Resilience Queue: ${error.message}`);
  }
};
