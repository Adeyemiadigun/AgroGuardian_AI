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
      const { farmId, interval, triggeredBy } = job.data;
      const syncType = triggeredBy === "manual" ? "Manual" : `Periodic (${interval || "scheduled"})`;
      
      logger.info(`Starting ${syncType} Weather Sync...`, { 
        jobId: job.id, 
        farmId,
        attempt: job.attemptsMade + 1,
      });

      const startTime = Date.now();
      let successCount = 0;
      let errorCount = 0;
      const errors: Array<{ farmId: string; farmName: string; error: string }> = [];

      try {
        if (farmId) {
          const farm = await Farm.findById(farmId);
          if (!farm) {
            throw new Error(`Farm ${farmId} not found`);
          }
          
          logger.info(`Syncing weather for specific farm: ${farm.name}`);
          await getClimateRisk(farmId);
          successCount = 1;
          logger.info(`Weather sync completed for farm: ${farm.name}`);
        } else {
          // Global sync: process all active farms
          const activeFarms = await Farm.find({ status: "active" });
          logger.info(`Processing weather for ${activeFarms.length} active farms.`);

          for (const farm of activeFarms) {
            try {
              logger.debug(`Syncing weather for farm: ${farm.name} (${farm._id})`);
              
              await getClimateRisk(farm._id.toString());
              successCount++;
              
              // Rate limiting: 500ms delay between API calls to respect API limits
              await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error: any) {
              errorCount++;
              const errorDetails = {
                farmId: farm._id.toString(),
                farmName: farm.name,
                error: error.message,
              };
              errors.push(errorDetails);
              logger.error(`Weather Sync failed for farm ${farm._id}: ${error.message}`, errorDetails);
              continue; // Continue processing other farms
            }
          }
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.info(`${syncType} Weather Sync completed`, {
          duration: `${duration}s`,
          successCount,
          errorCount,
          totalFarms: successCount + errorCount,
        });

        // Return job result for monitoring
        return {
          success: true,
          syncType,
          successCount,
          errorCount,
          duration,
          errors: errorCount > 0 ? errors : undefined,
        };
      } catch (error: any) {
        logger.error(`${syncType} Weather Sync job failed critically`, {
          error: error.message,
          stack: error.stack,
          jobId: job.id,
        });
        throw error; // Re-throw to trigger BullMQ retry logic
      }
    },
    { 
      connection: redisConnection as any,
      concurrency: 1, // Process one sync job at a time to avoid API rate limits
      limiter: {
        max: 10, // Max 10 jobs per...
        duration: 60000, // ...60 seconds (prevents API throttling)
      },
    }
  );

  // Enhanced event listeners for monitoring
  worker.on("completed", (job) => {
    const result = job.returnvalue;
    logger.info(`Weather Sync Job completed successfully`, {
      jobId: job.id,
      successCount: result?.successCount,
      errorCount: result?.errorCount,
      duration: result?.duration,
    });
  });

  worker.on("failed", (job, err) => {
    logger.error(`Weather Sync Job failed`, {
      jobId: job?.id,
      attemptsMade: job?.attemptsMade,
      error: err.message,
      stack: err.stack,
    });
  });

  worker.on("error", (err) => {
    logger.error(`Weather Sync Worker error: ${err.message}`);
  });

  logger.info("Weather Sync Worker initialized");
  return worker;
};
