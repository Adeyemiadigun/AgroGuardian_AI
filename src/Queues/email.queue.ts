import { isRedisQueueEnabled } from '../Config/queueMode';
import { enqueueJob } from './agroJobs.queue';
import logger from '../Utils/logger';
import { sendBrevoEmail } from '../Services/email.service';

// Kept for backward compatibility (previously the BullMQ queue name).
export const EMAIL_QUEUE = 'email-queue';

export const addEmailToQueue = async (to: string, subject: string, html: string) => {
  if (!isRedisQueueEnabled()) {
    // Dev-safe: avoid Redis/BullMQ. (Email sending can be enabled later if needed.)
    logger.warn(`Email queue disabled (QUEUE_MODE=inline). Skipping email to: ${to}`);
    return;
  }

  const result = await enqueueJob(
    'send-email',
    { to, subject, html },
    {
      attempts: 5,
      backoff: { type: 'exponential', delay: 10000 },
      removeOnComplete: true,
    },
    async () => {
      await sendBrevoEmail(to, subject, html);
    }
  );

  if (result.status === 'queued') {
    logger.debug(`Email job added to queue for: ${to}`);
  }
};
