import { isRedisQueueEnabled } from '../Config/queueMode';
import { enqueueJob } from './agroJobs.queue';
import { runWeatherSync } from '../Services/weather-sync.processor';
import logger from '../Utils/logger';

// Manual trigger for on-demand weather updates.
// Periodic scheduling lives in src/Schedulers/sweeps.ts.
export const triggerWeatherSyncNow = async (farmId?: string) => {
  if (!isRedisQueueEnabled()) {
    const jobId = `inline-weather-sync-${Date.now()}`;

    // Don't block the HTTP request thread; run in-process async.
    setImmediate(() => {
      runWeatherSync({ farmId, triggeredBy: 'manual' }).catch((e) =>
        logger.error('(inline) Manual weather sync failed', { jobId, farmId, error: e.message, stack: e.stack })
      );
    });

    logger.info('(inline) Manual weather sync triggered', { jobId, farmId });
    return { jobId, status: 'started' as const };
  }

  const result = await enqueueJob(
    'weather-sync',
    {
      farmId, // If provided, sync only this farm
      triggeredBy: 'manual',
      timestamp: new Date().toISOString(),
    },
    {
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 30000, // 30 seconds initial backoff
      },
      removeOnComplete: true,
      removeOnFail: { count: 5 },
    },
    // Upstash quota fallback: run in-process instead of failing the request.
    async () => {
      await runWeatherSync({ farmId, triggeredBy: 'manual' });
    }
  );

  if (result.status === 'queued') {
    logger.info(`Manual weather sync triggered`, { jobId: result.jobId, farmId });
    return { jobId: result.jobId, status: 'queued' as const };
  }

  if (result.status === 'inline') {
    logger.info('Manual weather sync degraded to inline run (Redis unavailable)', { farmId });
    return { jobId: null, status: 'started' as const };
  }

  throw new Error('Failed to trigger manual weather sync');
};
