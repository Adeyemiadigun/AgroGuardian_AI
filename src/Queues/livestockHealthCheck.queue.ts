import { Queue } from 'bullmq';
import { redisConnection } from '../Config/redis';
import logger from '../Utils/logger';

export const LIVESTOCK_HEALTHCHECK_QUEUE = 'livestock-healthcheck-queue';

const livestockHealthCheckQueue = new Queue(LIVESTOCK_HEALTHCHECK_QUEUE, {
  connection: redisConnection as any,
});

export const addLivestockHealthCheckJob = async (data: { livestockId: string; reason?: string }) => {
  try {
    await livestockHealthCheckQueue.add('process-livestock-healthcheck', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
    });

    logger.debug(`Livestock health-check job added for livestockId: ${data.livestockId}`);
  } catch (error: any) {
    logger.error(`Failed to add livestock health-check job: ${error.message}`);
  }
};
