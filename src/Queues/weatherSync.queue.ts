import { Queue } from 'bullmq';
import { redisConnection } from '../Config/redis';
import { isRedisQueueEnabled } from '../Config/queueMode';
import Farm from '../Models/Farm';
import { getClimateRisk } from '../Services/weather.service';
import logger from '../Utils/logger';

export const WEATHER_SYNC_QUEUE = 'weather-sync-queue';

let weatherSyncQueue: Queue | null = null;
const getWeatherSyncQueue = () => {
  if (!weatherSyncQueue) {
    weatherSyncQueue = new Queue(WEATHER_SYNC_QUEUE, {
      connection: redisConnection as any,
    });
  }
  return weatherSyncQueue;
};

let inlineWeatherSyncTimer: NodeJS.Timeout | null = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const runWeatherSyncInline = async (farmId?: string, interval?: string, triggeredBy?: 'manual' | 'periodic') => {
  const syncType = triggeredBy === 'manual' ? 'Manual' : `Periodic (${interval || 'scheduled'})`;
  const startTime = Date.now();

  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ farmId: string; farmName: string; error: string }> = [];

  if (farmId) {
    const farm = await Farm.findById(farmId);
    if (!farm) throw new Error(`Farm ${farmId} not found`);

    logger.info(`(inline) Syncing weather for farm: ${farm.name}`);
    await getClimateRisk(farmId);
    successCount = 1;
  } else {
    const activeFarms = await Farm.find({ status: 'active' });
    logger.info(`(inline) Processing weather for ${activeFarms.length} active farms.`);

    for (const farm of activeFarms) {
      try {
        await getClimateRisk(farm._id.toString());
        successCount++;
        await sleep(500);
      } catch (error: any) {
        errorCount++;
        errors.push({ farmId: farm._id.toString(), farmName: farm.name, error: error.message });
        logger.error(`(inline) Weather Sync failed for farm ${farm._id}: ${error.message}`);
      }
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  logger.info(`(inline) ${syncType} Weather Sync completed`, {
    duration: `${duration}s`,
    successCount,
    errorCount,
    totalFarms: successCount + errorCount,
  });

  return { success: true, syncType, successCount, errorCount, duration, errors: errorCount > 0 ? errors : undefined };
};

// Configurable sync intervals (use env variable or default to 6-hourly)
const SYNC_PATTERNS = {
  hourly: "0 * * * *", 
  "3-hourly": "0 */3 * * *", 
  "6-hourly": "0 */6 * * *", 
  daily: "0 6 * * *",        
  "twice-daily": "0 6,18 * * *",
} as const;

type SyncInterval = keyof typeof SYNC_PATTERNS;

export const initDailyWeatherSync = async (interval: SyncInterval = '6-hourly') => {
  if (!isRedisQueueEnabled()) {
    // Inline scheduler (dev): best-effort timer-based sync. Not persisted across restarts.
    const intervalMsMap: Record<SyncInterval, number> = {
      hourly: 60 * 60 * 1000,
      '3-hourly': 3 * 60 * 60 * 1000,
      '6-hourly': 6 * 60 * 60 * 1000,
      daily: 24 * 60 * 60 * 1000,
      'twice-daily': 12 * 60 * 60 * 1000,
    };

    if (inlineWeatherSyncTimer) return;

    const ms = intervalMsMap[interval] || intervalMsMap['6-hourly'];
    logger.warn(`Weather sync scheduler running inline every ~${Math.round(ms / 3600000)}h (QUEUE_MODE=inline)`);

    // Kick off immediately, then repeat
    setImmediate(() =>
      runWeatherSyncInline(undefined, interval, 'periodic').catch((e) => logger.error(`(inline) Weather sync failed: ${e.message}`))
    );

    inlineWeatherSyncTimer = setInterval(() => {
      runWeatherSyncInline(undefined, interval, 'periodic').catch((e) => logger.error(`(inline) Weather sync failed: ${e.message}`));
    }, ms);

    return;
  }

  try {
    const jobId = "periodic-global-weather-sync";
    const pattern = SYNC_PATTERNS[interval] || SYNC_PATTERNS["6-hourly"];

    // Remove any existing repeatable jobs to avoid duplicates
    const repeatableJobs = await getWeatherSyncQueue().getRepeatableJobs();
    for (const job of repeatableJobs) {
      if (job.id === jobId || job.name === "daily-sync" || job.name === "periodic-sync") {
        await getWeatherSyncQueue().removeRepeatableByKey(job.key);
        logger.info(`Removed old weather sync job: ${job.name}`);
      }
    }

    // Add the new repeatable job with retry logic
    await getWeatherSyncQueue().add(
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
  if (!isRedisQueueEnabled()) {
    const jobId = `inline-weather-sync-${Date.now()}`;

    // Don't block the HTTP request thread; run in-process async.
    setImmediate(() => {
      runWeatherSyncInline(farmId, undefined, 'manual').catch((e) =>
        logger.error('(inline) Manual weather sync failed', { jobId, farmId, error: e.message, stack: e.stack })
      );
    });

    logger.info('(inline) Manual weather sync triggered', { jobId, farmId });
    return { jobId, status: 'started' };
  }

  try {
    const job = await getWeatherSyncQueue().add(
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

export { weatherSyncQueue }; // may be null until first use

