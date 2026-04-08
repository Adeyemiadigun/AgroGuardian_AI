import { Queue } from 'bullmq';
import { redisConnection } from '../Config/redis';
import logger from '../Utils/logger';

export const LIVESTOCK_DIAGNOSIS_QUEUE = 'livestock-diagnosis-queue';

const livestockDiagnosisQueue = new Queue(LIVESTOCK_DIAGNOSIS_QUEUE, {
  connection: redisConnection as any,
});

export const addLivestockDiagnosisJob = async (data: { diagnosisId: string }) => {
  try {
    await livestockDiagnosisQueue.add('process-livestock-diagnosis', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
    });

    logger.debug(`Livestock diagnosis job added for ID: ${data.diagnosisId}`);
  } catch (error: any) {
    logger.error(`Failed to add livestock diagnosis job: ${error.message}`);
  }
};
