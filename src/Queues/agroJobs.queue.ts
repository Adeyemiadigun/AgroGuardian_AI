import { Queue, type JobsOptions } from 'bullmq';
import { redisConnection } from '../Config/redis';
import { isRedisQueueEnabled } from '../Config/queueMode';
import logger from '../Utils/logger';

/**
 * The single BullMQ queue used by the whole app.
 *
 * All background work (diagnoses, emails, health checks, weather sync,
 * reminder sweeps, ...) is funneled through this one queue so we run ONE
 * BullMQ worker instead of ~10, which keeps Upstash free-tier command
 * usage far below the 500k/month cap (idle BullMQ workers poll Redis
 * every few seconds; 10 of them alone exceeded the budget).
 */
export const AGRO_QUEUE = 'agro-jobs';

let agroQueue: Queue | null = null;
const getAgroQueue = () => {
  if (!agroQueue) {
    agroQueue = new Queue(AGRO_QUEUE, {
      connection: redisConnection as any,
    });
  }
  return agroQueue;
};

export type EnqueueResult = {
  jobId: string | null;
  status: 'queued' | 'inline' | 'skipped' | 'failed';
};

// Upstash free tier rejects with "max requests limit exceeded" (and similar
// variants); also match generic throttling/connection errors so the job still
// runs instead of being dropped.
const QUOTA_ERROR =
  /max requests limit exceeded|commands? (per day )?limit exceeded|quota|exhausted|too many requests|Connection is closed|ECONNREFUSED/i;

/**
 * Enqueue a job on the single agro-jobs queue.
 *
 * - QUEUE_MODE=inline: runs `runInline` in-process when provided, else skips.
 * - QUEUE_MODE=redis: adds to BullMQ; on Upstash quota errors with a
 *   `runInline` fallback provided, degrades to an in-process run so work
 *   is never silently dropped.
 *
 * Never throws; errors are logged and reported via status 'failed'.
 */
export const enqueueJob = async (
  name: string,
  data: Record<string, unknown>,
  opts: JobsOptions,
  runInline?: () => Promise<unknown>
): Promise<EnqueueResult> => {
  if (!isRedisQueueEnabled()) {
    if (runInline) {
      setImmediate(() => {
        Promise.resolve()
          .then(() => runInline())
          .catch((e: any) => logger.error(`Inline ${name} failed: ${e?.message || e}`));
      });
      return { jobId: null, status: 'inline' };
    }
    logger.warn(`Queue job "${name}" skipped (QUEUE_MODE=inline).`);
    return { jobId: null, status: 'skipped' };
  }

  try {
    const job = await getAgroQueue().add(name, data, opts);
    return { jobId: job.id ?? null, status: 'queued' };
  } catch (error: any) {
    const msg = String(error?.message || '');
    logger.error(`Failed to enqueue "${name}": ${msg}`);

    if (runInline && QUOTA_ERROR.test(msg)) {
      setImmediate(() => {
        Promise.resolve()
          .then(() => runInline())
          .catch((e: any) => logger.error(`Fallback inline ${name} failed: ${e?.message || e}`));
      });
      return { jobId: null, status: 'inline' };
    }

    return { jobId: null, status: 'failed' };
  }
};
