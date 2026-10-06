import { Worker, type Job } from 'bullmq';
import { redisConnection } from '../Config/redis';
import { isRedisQueueEnabled } from '../Config/queueMode';
import { AGRO_QUEUE } from '../Queues/agroJobs.queue';
import logger from '../Utils/logger';
import { processCropDiagnosisJob } from '../Services/diagnosisJob.service';
import { livestockDiagnosisService } from '../Services/livestock-diagnosis.service';
import { livestockHealthCheckService } from '../Services/livestock-health-check.service';
import { updateResilienceProfile } from '../Services/resilience.service';
import { sendBrevoEmail } from '../Services/email.service';
import { runWeatherSync } from '../Services/weather-sync.processor';
import { runFeedingReminderJob } from '../Sweeps/feedingReminder.sweep';
import { runVaccinationReminderJob } from '../Sweeps/vaccinationReminder.sweep';
import { runDewormingReminderJob } from '../Sweeps/dewormingReminder.sweep';
import { runBreedingFollowUpReminderSweep } from '../Sweeps/breedingFollowUpReminder.sweep';

type JobHandler = (data: any, job: Job) => Promise<unknown>;

const HANDLERS: Record<string, JobHandler> = {
  'process-diagnosis': async (data) => {
    const { diagnosisId, imageUrls, cropType, farmId, userId } = data;
    try {
      await processCropDiagnosisJob({ diagnosisId, imageUrls, cropType, farmId, userId });
    } catch (error: any) {
      logger.error(`AI Worker failed for diagnosis ${diagnosisId}: ${error.message}`);
      throw error;
    }
  },

  'process-livestock-diagnosis': async (data) => {
    const { diagnosisId } = data as { diagnosisId: string };
    logger.info(`AI Worker analyzing livestock diagnosis: ${diagnosisId}`);
    await livestockDiagnosisService.processDiagnosisJob(diagnosisId);
  },

  'process-livestock-healthcheck': async (data) => {
    const { livestockId, reason } = data as { livestockId: string; reason?: string };
    logger.info(`HealthCheck Worker recomputing report for livestock: ${livestockId}`);
    await livestockHealthCheckService.recompute(livestockId, { reason, useAI: true });
  },

  'update-resilience-score': async (data) => {
    const { farmId, userId } = data;
    logger.info(`Worker processing Resilience Score for Farm: ${farmId}`);
    await updateResilienceProfile(farmId, userId);
  },

  'send-email': async (data) => {
    const { to, subject, html } = data;
    logger.info(`Processing email for: ${to} - Subject: ${subject}`);
    await sendBrevoEmail(to, subject, html);
  },

  'weather-sync': async (data, job) =>
    runWeatherSync({
      farmId: data.farmId,
      interval: data.interval,
      triggeredBy: data.triggeredBy,
      jobId: job.id,
      attempt: job.attemptsMade + 1,
    }),

  'sweep-feeding-reminders': async () => runFeedingReminderJob(),
  'sweep-vaccination-reminders': async () => runVaccinationReminderJob(),
  'sweep-deworming-reminders': async () => runDewormingReminderJob(),
  'sweep-breeding-followup': async () => runBreedingFollowUpReminderSweep(),
};

/**
 * The single BullMQ worker for the whole app (replaces the previous
 * ~10 per-queue workers).
 *
 * Cost notes (Upstash free tier = 500k commands/month):
 * - `drainDelay: 60` makes the idle blocking pop wait 60s instead of the
 *   default 5s (~10x fewer idle polls; job pickup latency is unaffected
 *   because adding a job pops the blocked marker instantly).
 * - `stalledInterval: 60000` reduces stalled-check chatter (must stay
 *   above the default 30s lockDuration).
 * - Combined with eliminating 9 other workers, idle usage drops from
 *   ~5.2M to ~130k commands/month.
 */
export const initAgroWorker = (): Worker | null => {
  if (!isRedisQueueEnabled()) {
    logger.warn('Agro worker not started (QUEUE_MODE=inline).');
    return null;
  }

  const worker = new Worker(
    AGRO_QUEUE,
    async (job: Job) => {
      const handler = HANDLERS[job.name];
      if (!handler) {
        throw new Error(`No handler registered for job "${job.name}"`);
      }
      return handler(job.data, job);
    },
    {
      connection: redisConnection as any,
      concurrency: 6,
      drainDelay: 60,
      stalledInterval: 60000,
    }
  );

  worker.on('completed', (job) => {
    logger.debug(`Agro job ${job.name}#${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Agro job ${job?.name}#${job?.id} failed: ${err.message}`, {
      attemptsMade: job?.attemptsMade,
      stack: err.stack,
    });
  });

  worker.on('error', (err) => {
    logger.error(`Agro worker error: ${err.message}`);
  });

  logger.info('Agro worker initialized', { queue: AGRO_QUEUE, concurrency: 6 });
  return worker;
};
