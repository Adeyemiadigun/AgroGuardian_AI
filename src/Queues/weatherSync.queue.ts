import { Queue } from "bullmq";
import { redisConnection } from "../Config/redis";
import logger from "../Utils/logger";

export const WEATHER_SYNC_QUEUE = "weather-sync-queue";

const weatherSyncQueue = new Queue(WEATHER_SYNC_QUEUE, {
  connection: redisConnection as any,
});


export const initDailyWeatherSync = async () => {
  try {
    const jobId = "daily-global-weather-sync";

    await weatherSyncQueue.add(
      "daily-sync",
      {},
      {
        jobId,
        repeat: {
          pattern: "0 6 * * *", 
        },
        removeOnComplete: true,
        removeOnFail: { count: 10 }, 
      }
    );

    logger.info("Daily Weather Sync Schedule initialized (6:00 AM daily)");
  } catch (error: any) {
    logger.error(`Failed to initialize Daily Weather Sync: ${error.message}`);
  }
};
