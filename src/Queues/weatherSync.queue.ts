import { Queue } from "bullmq";
import { redisConnection } from "../Config/redis";
import logger from "../Utils/logger";

export const WEATHER_SYNC_QUEUE = "weather-sync-queue";

const weatherSyncQueue = new Queue(WEATHER_SYNC_QUEUE, {
  connection: redisConnection as any,
});

// Configurable sync intervals (use env variable or default to 6-hourly)
const SYNC_PATTERNS = {
  hourly: "0 * * * *", 
  "3-hourly": "0 */3 * * *", 
  "6-hourly": "0 */6 * * *", 
  daily: "0 6 * * *",        
  "twice-daily": "0 6,18 * * *",
} as const;

type SyncInterval = keyof typeof SYNC_PATTERNS;

export const initDailyWeatherSync = async (interval: SyncInterval = "6-hourly") => {
  try {
    const jobId = "periodic-global-weather-sync";
    const pattern = SYNC_PATTERNS[interval] || SYNC_PATTERNS["6-hourly"];

    // Remove any existing repeatable jobs to avoid duplicates
    const repeatableJobs = await weatherSyncQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      if (job.id === jobId || job.name === "daily-sync" || job.name === "periodic-sync") {
        await weatherSyncQueue.removeRepeatableByKey(job.key);
        logger.info(`Removed old weather sync job: ${job.name}`);
      }
    }

    // Add the new repeatable job with retry logic
    await weatherSyncQueue.add(
      "periodic-sync",
      { interval, startedAt: new Date().toISOString() },
      {
        jobId,
        repeat: {
          pattern,
        },
        attempts: 3, // Retry up to 3 times on failure
        backoff: {
          type: "exponential", // 2^attempt * 60000ms (1min, 2min, 4min)
          delay: 60000, // Initial backoff delay: 1 minute
        },
        removeOnComplete: { count: 50 }, // Keep last 50 successful jobs for monitoring
        removeOnFail: { count: 20 }, // Keep last 20 failed jobs for debugging
      }
    );

    logger.info(`Periodic Weather Sync initialized: ${interval} (${pattern})`);
  } catch (error: any) {
    logger.error(`Failed to initialize Periodic Weather Sync: ${error.message}`);
  }
};

// Manual trigger for on-demand weather updates
export const triggerWeatherSyncNow = async (farmId?: string) => {
  try {
    const job = await weatherSyncQueue.add(
      "manual-sync",
      { 
        farmId, // If provided, sync only this farm
        triggeredBy: "manual",
        timestamp: new Date().toISOString(),
      },
      {
        attempts: 2,
        backoff: {
          type: "exponential",
          delay: 30000, // 30 seconds initial backoff
        },
        removeOnComplete: true,
        removeOnFail: { count: 5 },
      }
    );

    logger.info(`Manual weather sync triggered`, { jobId: job.id, farmId });
    return { jobId: job.id, status: "queued" };
  } catch (error: any) {
    logger.error(`Failed to trigger manual weather sync: ${error.message}`);
    throw error;
  }
};

export { weatherSyncQueue };
