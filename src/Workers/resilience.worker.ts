import { Worker, Job } from "bullmq";
import { redisConnection } from "../Config/redis";
import { RESILIENCE_QUEUE } from "../Queues/resilience.queue";
import { updateResilienceProfile } from "../Services/resilience.service";
import logger from "../Utils/logger";

export const initResilienceWorker = () => {
  const worker = new Worker(
    RESILIENCE_QUEUE,
    async (job: Job) => {
      const { farmId, userId } = job.data;
      logger.info(`Worker processing Resilience Score for Farm: ${farmId}`);
      
      await updateResilienceProfile(farmId, userId);
    },
    { 
      connection: redisConnection as any,
      concurrency: 5
    }
  );

  worker.on("completed", (job) => {
    logger.info(`Resilience Sync Job ${job.id} completed successfully.`);
  });

  worker.on("failed", (job, err) => {
    logger.error(`Resilience Sync Job ${job?.id} failed: ${err.message}`);
  });

  return worker;
};
