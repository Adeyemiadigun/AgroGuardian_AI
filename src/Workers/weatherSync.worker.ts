import { Worker, Job } from "bullmq";
import { redisConnection } from "../Config/redis";
import { WEATHER_SYNC_QUEUE } from "../Queues/weatherSync.queue";
import Farm from "../Models/Farm";
import { getClimateRisk } from "../Services/weather.service";
import logger from "../Utils/logger";

export const initWeatherSyncWorker = () => {
  const worker = new Worker(
    WEATHER_SYNC_QUEUE,
    async (job: Job) => {
      logger.info("Starting Daily Global Weather Sync...");

      const activeFarms = await Farm.find({ status: "active" });
      logger.info(`Processing weather for ${activeFarms.length} active farms.`);

      for (const farm of activeFarms) {
        try {
          logger.debug(`Syncing weather for farm: ${farm.name} (${farm._id})`);
          
          await getClimateRisk(farm._id.toString());
          
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error: any) {
          logger.error(`Weather Sync failed for farm ${farm._id}: ${error.message}`);
          continue;
        }
      }

      logger.info("Daily Global Weather Sync completed.");
    },
    { 
      connection: redisConnection as any,
      concurrency: 1 
    }
  );

  worker.on("failed", (job, err) => {
    logger.error(`Weather Sync Job failed: ${err.message}`);
  });

  return worker;
};
