import { Queue } from 'bullmq';
import { redisConnection } from '../Config/redis';
import { isRedisQueueEnabled } from '../Config/queueMode';
import logger from '../Utils/logger';

export const BREEDING_FOLLOWUP_REMINDER_QUEUE = 'breeding-followup-reminder-queue';

let reminderQueue: Queue | null = null;
const getReminderQueue = () => {
  if (!reminderQueue) {
    reminderQueue = new Queue(BREEDING_FOLLOWUP_REMINDER_QUEUE, {
      connection: redisConnection as any,
    });
  }
  return reminderQueue;
};

const PATTERNS = {
  hourly: '0 * * * *',
  '3-hourly': '0 */3 * * *',
  '6-hourly': '0 */6 * * *',
  daily: '0 6 * * *',
} as const;

type IntervalKey = keyof typeof PATTERNS;

export const initBreedingFollowUpReminderSchedule = async (interval: IntervalKey = 'hourly') => {
  if (!isRedisQueueEnabled()) {
    logger.warn('Breeding follow-up reminder scheduler disabled (QUEUE_MODE=inline).');
    return;
  }

  try {
    const jobId = 'periodic-breeding-followup-reminder-sweep';
    const pattern = PATTERNS[interval] || PATTERNS.hourly;

    // Remove any existing repeatable jobs to avoid duplicates
    const repeatableJobs = await getReminderQueue().getRepeatableJobs();
    for (const job of repeatableJobs) {
      if (job.id === jobId || job.name === 'sweep-reminders') {
        await getReminderQueue().removeRepeatableByKey(job.key);
      }
    }

    await getReminderQueue().add(
      'sweep-reminders',
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

    logger.info(`Breeding follow-up reminder schedule initialized: ${interval} (${pattern})`);
  } catch (error: any) {
    logger.error(`Failed to init breeding follow-up reminder schedule: ${error.message}`);
  }
};

export { reminderQueue };
