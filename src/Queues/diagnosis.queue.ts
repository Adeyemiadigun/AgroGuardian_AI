import { Queue } from 'bullmq';
import { redisConnection } from '../Config/redis';
import { isRedisQueueEnabled } from '../Config/queueMode';
import logger from '../Utils/logger';
import { processCropDiagnosisJob, type CropDiagnosisJobData } from '../Services/diagnosisJob.service';

export const DIAGNOSIS_QUEUE = 'diagnosis-queue';

let diagnosisQueue: Queue | null = null;
const getDiagnosisQueue = () => {
  if (!diagnosisQueue) {
    diagnosisQueue = new Queue(DIAGNOSIS_QUEUE, {
      connection: redisConnection as any,
    });
  }
  return diagnosisQueue;
};

export const addDiagnosisJob = async (data: CropDiagnosisJobData) => {
  // Dev-safe mode: run without Redis/BullMQ.
  if (!isRedisQueueEnabled()) {
    setImmediate(async () => {
      try {
        await processCropDiagnosisJob(data);
      } catch (e: any) {
        logger.error(`Inline crop diagnosis failed: ${e?.message || e}`);
      }
    });
    return;
  }

  try {
    await getDiagnosisQueue().add('process-diagnosis', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
    });
    logger.debug(`Diagnosis job added for ID: ${data.diagnosisId}`);
  } catch (error: any) {
    logger.error(`Failed to add diagnosis job: ${error.message}`);

    // If Upstash hits request cap, degrade gracefully rather than leaving "processing" forever.
    if (String(error?.message || '').includes('max requests limit exceeded')) {
      setImmediate(async () => {
        try {
          await processCropDiagnosisJob(data);
        } catch (e: any) {
          logger.error(`Fallback inline crop diagnosis failed: ${e?.message || e}`);
        }
      });
    }
  }
};
