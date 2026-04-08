import { Worker, Job } from 'bullmq';
import { redisConnection } from '../Config/redis';
import { LIVESTOCK_DIAGNOSIS_QUEUE } from '../Queues/livestockDiagnosis.queue';
import logger from '../Utils/logger';
import { livestockDiagnosisService } from '../Services/livestock-diagnosis.service';

export const initLivestockDiagnosisWorker = () => {
  const worker = new Worker(
    LIVESTOCK_DIAGNOSIS_QUEUE,
    async (job: Job) => {
      const { diagnosisId } = job.data as { diagnosisId: string };
      logger.info(`AI Worker analyzing livestock diagnosis: ${diagnosisId}`);
      await livestockDiagnosisService.processDiagnosisJob(diagnosisId);
    },
    {
      connection: redisConnection as any,
      concurrency: 2,
    }
  );

  return worker;
};
