import { Queue } from 'bullmq';
import { redisConnection } from '../Config/redis';
import { isRedisQueueEnabled } from '../Config/queueMode';
import logger from '../Utils/logger';

export const DEWORMING_REMINDER_QUEUE = 'deworming-reminder-queue';

let reminderQueue: Queue | null = null;
const getReminderQueue = () => {
  if (!reminderQueue) {
    reminderQueue = new Queue(DEWORMING_REMINDER_QUEUE, {
      connection: redisConnection as any,
    });
  }
  return reminderQueue;
};

const PATTERNS = {
  hourly: '0 * * * *',
  '6-hourly': '0 */6 * * *',
  daily: '0 7 * * *',
} as const;

type IntervalKey = keyof typeof PATTERNS;

export const initDewormingReminderSchedule = async (interval: IntervalKey = 'hourly') => {
  if (!isRedisQueueEnabled()) {
    logger.warn('Deworming reminder scheduler disabled (QUEUE_MODE=inline).');
    return;
  }

  try {
    const jobId = 'periodic-deworming-reminder-sweep';
    const pattern = PATTERNS[interval] || PATTERNS.hourly;

    const repeatableJobs = await getReminderQueue().getRepeatableJobs();
    for (const job of repeatableJobs) {
      if (job.id === jobId || job.name === 'sweep-deworming-reminders') {
        await getReminderQueue().removeRepeatableByKey(job.key);
      }
    }

    await getReminderQueue().add(
      'sweep-deworming-reminders',
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

    logger.info(`Deworming reminder schedule initialized: ${interval} (${pattern})`);
  } catch (error: any) {
    logger.error(`Failed to init deworming reminder schedule: ${error.message}`);
  }
};

export { reminderQueue };
