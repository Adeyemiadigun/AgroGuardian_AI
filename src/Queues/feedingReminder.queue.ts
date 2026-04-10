import { Queue } from 'bullmq';
import { redisConnection } from '../Config/redis';
import { isRedisQueueEnabled } from '../Config/queueMode';
import logger from '../Utils/logger';

export const FEEDING_REMINDER_QUEUE = 'feeding-reminder-queue';

let reminderQueue: Queue | null = null;
const getReminderQueue = () => {
  if (!reminderQueue) {
    reminderQueue = new Queue(FEEDING_REMINDER_QUEUE, {
      connection: redisConnection as any,
    });
  }
  return reminderQueue;
};

const PATTERNS = {
  '15-min': '*/15 * * * *',
  '30-min': '*/30 * * * *',
  hourly: '0 * * * *',
} as const;

type IntervalKey = keyof typeof PATTERNS;

export const initFeedingReminderSchedule = async (interval: IntervalKey = '15-min') => {
  if (!isRedisQueueEnabled()) {
    logger.warn('Feeding reminder scheduler disabled (QUEUE_MODE=inline).');
    return;
  }

  try {
    const jobId = 'periodic-feeding-reminder-sweep';
    const pattern = PATTERNS[interval] || PATTERNS['15-min'];

    // Remove any existing repeatable jobs to avoid duplicates
    const repeatableJobs = await getReminderQueue().getRepeatableJobs();
    for (const job of repeatableJobs) {
      if (job.id === jobId || job.name === 'sweep-feeding-reminders') {
        await getReminderQueue().removeRepeatableByKey(job.key);
      }
    }

    await getReminderQueue().add(
      'sweep-feeding-reminders',
      { interval, startedAt: new Date().toISOString() },
      {
        jobId,
        repeat: { pattern },
        attempts: 3,
        backoff: { type: 'exponential', delay: 60000 },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 20 },
      }
    );

    logger.info(`Feeding reminder schedule initialized: ${interval} (${pattern})`);
  } catch (error: any) {
    logger.error(`Failed to init feeding reminder schedule: ${error.message}`);
  }
};

export { reminderQueue };
