import { Worker, Job } from 'bullmq';
import { redisConnection } from '../Config/redis';
import { DIAGNOSIS_QUEUE } from '../Queues/diagnosis.queue';
import logger from '../Utils/logger';
import { processCropDiagnosisJob } from '../Services/diagnosisJob.service';

export const initDiagnosisWorker = () => {
  const worker = new Worker(
    DIAGNOSIS_QUEUE,
    async (job: Job) => {
      const { diagnosisId, imageUrls, cropType, farmId, userId } = job.data;

      try {
        await processCropDiagnosisJob({ diagnosisId, imageUrls, cropType, farmId, userId });
      } catch (error: any) {
        logger.error(`AI Worker failed for diagnosis ${diagnosisId}: ${error.message}`);
        throw error;
      }
    },
    { 
      connection: redisConnection as any,
      concurrency: 3 
    }
  );

  return worker;
};
