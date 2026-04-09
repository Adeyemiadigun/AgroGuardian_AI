import { Queue } from 'bullmq';
import { redisConnection } from '../Config/redis';
import { isRedisQueueEnabled } from '../Config/queueMode';
import logger from '../Utils/logger';

export const EMAIL_QUEUE = 'email-queue';

let emailQueue: Queue | null = null;
const getEmailQueue = () => {
  if (!emailQueue) {
    emailQueue = new Queue(EMAIL_QUEUE, {
      connection: redisConnection as any,
    });
  }
  return emailQueue;
};

export const addEmailToQueue = async (to: string, subject: string, html: string) => {
  if (!isRedisQueueEnabled()) {
    // Dev-safe: avoid Redis/BullMQ. (Email sending can be enabled later if needed.)
    logger.warn(`Email queue disabled (QUEUE_MODE=inline). Skipping email to: ${to}`);
    return;
  }

  try {
    await getEmailQueue().add(
      'send-email',
      { to, subject, html },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: true,
      }
    );
    logger.debug(`Email job added to queue for: ${to}`);
  } catch (error: any) {
    logger.error(`Failed to add email to queue: ${error.message}`);
  }
};
