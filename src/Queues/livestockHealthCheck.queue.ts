import { Queue } from 'bullmq';
import { redisConnection } from '../Config/redis';
import { isRedisQueueEnabled } from '../Config/queueMode';
import logger from '../Utils/logger';

export const LIVESTOCK_HEALTHCHECK_QUEUE = 'livestock-healthcheck-queue';

let livestockHealthCheckQueue: Queue | null = null;
const getLivestockHealthCheckQueue = () => {
  if (!livestockHealthCheckQueue) {
    livestockHealthCheckQueue = new Queue(LIVESTOCK_HEALTHCHECK_QUEUE, {
      connection: redisConnection as any,
    });
  }
  return livestockHealthCheckQueue;
};

export const addLivestockHealthCheckJob = async (data: { livestockId: string; reason?: string }) => {
  if (!isRedisQueueEnabled()) return;

  try {
    await getLivestockHealthCheckQueue().add('process-livestock-healthcheck', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
    });

    logger.debug(`Livestock health-check job added for livestockId: ${data.livestockId}`);
  } catch (error: any) {
    logger.error(`Failed to add livestock health-check job: ${error.message}`);
  }
};
