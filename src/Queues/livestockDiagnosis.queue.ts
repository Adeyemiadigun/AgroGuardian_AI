import { Queue } from 'bullmq';
import { redisConnection } from '../Config/redis';
import { isRedisQueueEnabled } from '../Config/queueMode';
import logger from '../Utils/logger';
import { livestockDiagnosisService } from '../Services/livestock-diagnosis.service';

export const LIVESTOCK_DIAGNOSIS_QUEUE = 'livestock-diagnosis-queue';

let livestockDiagnosisQueue: Queue | null = null;
const getLivestockDiagnosisQueue = () => {
  if (!livestockDiagnosisQueue) {
    livestockDiagnosisQueue = new Queue(LIVESTOCK_DIAGNOSIS_QUEUE, {
      connection: redisConnection as any,
    });
  }
  return livestockDiagnosisQueue;
};

export const addLivestockDiagnosisJob = async (data: { diagnosisId: string }) => {
  if (!isRedisQueueEnabled()) {
    setImmediate(async () => {
      try {
        await livestockDiagnosisService.processDiagnosisJob(data.diagnosisId);
      } catch (e: any) {
        logger.error(`Inline livestock diagnosis failed: ${e?.message || e}`);
      }
    });
    return;
  }

  try {
    await getLivestockDiagnosisQueue().add('process-livestock-diagnosis', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
    });

    logger.debug(`Livestock diagnosis job added for ID: ${data.diagnosisId}`);
  } catch (error: any) {
    logger.error(`Failed to add livestock diagnosis job: ${error.message}`);

    if (String(error?.message || '').includes('max requests limit exceeded')) {
      setImmediate(async () => {
        try {
          await livestockDiagnosisService.processDiagnosisJob(data.diagnosisId);
        } catch (e: any) {
          logger.error(`Fallback inline livestock diagnosis failed: ${e?.message || e}`);
        }
      });
    }
  }
};
