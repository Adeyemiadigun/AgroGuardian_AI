import Farm from '../Models/Farm';
import { getClimateRisk } from '../Services/weather.service';
import logger from '../Utils/logger';

export type WeatherSyncInput = {
  farmId?: string;
  interval?: string;
  triggeredBy?: 'manual' | 'periodic';
  jobId?: string;
  attempt?: number;
};

export type WeatherSyncResult = {
  success: boolean;
  syncType: string;
  successCount: number;
  errorCount: number;
  duration: string;
  errors?: Array<{ farmId: string; farmName: string; error: string }>;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Serializes weather syncs in-process (single worker no longer has
// BullMQ's per-queue concurrency: 1). Prevents overlapping runs from
// hammering the OpenWeather API when a manual trigger lands while a
// periodic global sync is still running.
let activeSync: Promise<WeatherSyncResult> | null = null;

const doSync = async (input: WeatherSyncInput): Promise<WeatherSyncResult> => {
  const { farmId, interval, triggeredBy, jobId, attempt } = input;
  const syncType = triggeredBy === 'manual' ? 'Manual' : `Periodic (${interval || 'scheduled'})`;

  logger.info(`Starting ${syncType} Weather Sync...`, { jobId, farmId, attempt });

  const startTime = Date.now();
  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ farmId: string; farmName: string; error: string }> = [];

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
    const activeFarms = await Farm.find({ status: 'active' });
    logger.info(`Processing weather for ${activeFarms.length} active farms.`);

    for (const farm of activeFarms) {
      try {
        logger.debug(`Syncing weather for farm: ${farm.name} (${farm._id})`);

        await getClimateRisk(farm._id.toString());
        successCount++;

        // Rate limiting: 500ms delay between API calls to respect API limits
        await sleep(500);
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

  return {
    success: true,
    syncType,
    successCount,
    errorCount,
    duration,
    errors: errorCount > 0 ? errors : undefined,
  };
};

/**
 * Run a weather sync, one at a time per process.
 * Shared by the agro-jobs worker, the periodic scheduler, and the
 * manual (inline) trigger so there is a single implementation.
 */
export const runWeatherSync = async (input: WeatherSyncInput): Promise<WeatherSyncResult> => {
  while (activeSync) {
    try {
      await activeSync;
    } catch {
      // previous sync error is logged by its own handler; just wait for it
    }
  }

  const syncType = input.triggeredBy === 'manual' ? 'Manual' : `Periodic (${input.interval || 'scheduled'})`;
  const promise = doSync(input).catch((error: any) => {
    logger.error(`${syncType} Weather Sync job failed critically`, {
      error: error.message,
      stack: error.stack,
      jobId: input.jobId,
    });
    throw error;
  });
  activeSync = promise;

  try {
    return await promise;
  } finally {
    if (activeSync === promise) {
      activeSync = null;
    }
  }
};
