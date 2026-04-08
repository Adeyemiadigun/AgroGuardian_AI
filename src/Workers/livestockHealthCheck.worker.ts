import { Worker, Job } from 'bullmq';
import { redisConnection } from '../Config/redis';
import { LIVESTOCK_HEALTHCHECK_QUEUE } from '../Queues/livestockHealthCheck.queue';
import logger from '../Utils/logger';
import { livestockHealthCheckService } from '../Services/livestock-health-check.service';

export const initLivestockHealthCheckWorker = () => {
  const worker = new Worker(
    LIVESTOCK_HEALTHCHECK_QUEUE,
    async (job: Job) => {
      const { livestockId, reason } = job.data as { livestockId: string; reason?: string };
      logger.info(`HealthCheck Worker recomputing report for livestock: ${livestockId}`);
      await livestockHealthCheckService.recompute(livestockId, { reason, useAI: true });
    },
    {
      connection: redisConnection as any,
      concurrency: 2,
    }
  );

  return worker;
};
