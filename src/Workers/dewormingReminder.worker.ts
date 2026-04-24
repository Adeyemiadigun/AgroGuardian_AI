import { Worker, Job } from 'bullmq';
import { redisConnection } from '../Config/redis';
import { DEWORMING_REMINDER_QUEUE } from '../Queues/dewormingReminder.queue';
import { LivestockDeworming } from '../Models/LivestockHealth';
import logger from '../Utils/logger';
import { createNotification } from '../Services/notification.service';
import { sendDewormingReminderEmail } from '../Services/email.service';

export type DewormingReminderSweepResult = {
  remindersSent: number;
  dewormingsScanned: number;
  dewormingsMatched: number;
  dewormingsUpdated: number;
  skips: Record<string, number>;
  email: { attempted: number; queued: number; failed: number; missingEmail: number };
  notifications: { attempted: number; created: number; failed: number };
};

const getAnimalName = (livestock: any) => livestock?.name || livestock?.tagId || 'Animal';

export const runDewormingReminderSweep = async (opts: {
  now: Date;
  limit?: number;
}): Promise<DewormingReminderSweepResult> => {
  const now = opts.now;
  const limit = opts.limit ?? 500;

  const daysAhead = Math.max(0, parseInt(process.env.DEWORMING_REMINDER_DAYS_AHEAD || '0', 10) || 0);
  const windowHours = Math.max(1, parseInt(process.env.DEWORMING_REMINDER_WINDOW_HOURS || '24', 10) || 24);
  const verbose = process.env.DEWORMING_REMINDER_DEBUG === 'true';

  const msAhead = daysAhead * 24 * 60 * 60 * 1000;
  const upper = new Date(now.getTime() + msAhead);
  const lower = new Date(upper.getTime() - windowHours * 60 * 60 * 1000);

  const skips: Record<string, number> = {
    missingDueDate: 0,
    missingOwner: 0,
    alreadyReminded: 0,
    saveFailed: 0,
  };

  const email = { attempted: 0, queued: 0, failed: 0, missingEmail: 0 };
  const notifications = { attempted: 0, created: 0, failed: 0 };

  logger.info('Deworming reminder sweep started', {
    now: now.toISOString(),
    daysAhead,
    windowHours,
    lower: lower.toISOString(),
    upper: upper.toISOString(),
    limit,
  });

  const dewormings = await LivestockDeworming.find({
    nextDueDate: { $exists: true, $ne: null, $gt: lower, $lte: upper },
  })
    .populate({
      path: 'farmId',
      select: 'name owner',
      populate: { path: 'owner', select: 'email firstName lastName' },
    })
    .populate({
      path: 'livestockId',
      select: 'name tagId species owner',
      populate: { path: 'owner', select: 'email firstName lastName' },
    })
    .sort({ nextDueDate: 1 })
    .limit(limit);

  let remindersSent = 0;
  let dewormingsScanned = 0;
  let dewormingsMatched = 0;
  let dewormingsUpdated = 0;

  for (const d of dewormings) {
    dewormingsScanned++;

    const due = (d as any).nextDueDate ? new Date((d as any).nextDueDate) : null;
    if (!due || Number.isNaN(due.getTime())) {
      skips.missingDueDate++;
      continue;
    }

    const reminderKey = `${due.toISOString()}|ahead=${daysAhead}`;
    if ((d as any).lastReminderKey === reminderKey) {
      skips.alreadyReminded++;
      continue;
    }

    const farm: any = (d as any).farmId;
    const livestock: any = (d as any).livestockId;
    const farmOwner: any = farm?.owner;
    const livestockOwner: any = livestock?.owner;

    const owner: any = farmOwner?.email ? farmOwner : (livestockOwner?.email ? livestockOwner : null);
    const ownerId = owner?._id?.toString?.();
    if (!ownerId) {
      skips.missingOwner++;
      continue;
    }

    const livestockId = livestock?._id?.toString?.();
    const farmId = farm?._id?.toString?.();
    const farmName = farm?.name;
    const animalName = getAnimalName(livestock);
    const productName = String((d as any).productName || 'deworming');

    const dueText = due.toLocaleDateString();
    const title = 'Deworming reminder';
    const message = `${animalName} is due for deworming (${productName}) on ${dueText}.`;
    const link = livestockId ? `/livestock/${livestockId}` : (farmId ? `/livestock?farmId=${farmId}` : undefined);

    if (verbose) {
      logger.info('Deworming reminder matched', {
        dewormingId: (d as any)._id?.toString?.(),
        ownerEmail: owner?.email,
        farmName,
        livestockId,
        productName,
        due: due.toISOString(),
      });
    }

    notifications.attempted++;
    try {
      await createNotification(ownerId, title, message, 'treatment', link);
      notifications.created++;
    } catch (err: any) {
      notifications.failed++;
      logger.error(`Failed to create deworming notification: ${err.message}`);
    }

    if (owner?.email) {
      email.attempted++;
      try {
        await sendDewormingReminderEmail(owner.email, {
          dueDate: due,
          productName,
          farmName,
          livestockName: animalName,
        });
        email.queued++;
      } catch (err: any) {
        email.failed++;
        logger.error(`Failed to queue deworming reminder email to ${owner.email}: ${err.message}`);
      }
    } else {
      email.missingEmail++;
    }

    (d as any).lastReminderKey = reminderKey;
    (d as any).lastReminderSentAt = now;
    try {
      await (d as any).save();
      dewormingsUpdated++;
      dewormingsMatched++;
      remindersSent++;
    } catch (err: any) {
      skips.saveFailed++;
      logger.error(`Failed to update deworming reminder key: ${err.message}`);
    }
  }

  const result: DewormingReminderSweepResult = {
    remindersSent,
    dewormingsScanned,
    dewormingsMatched,
    dewormingsUpdated,
    skips,
    email,
    notifications,
  };

  logger.info('Deworming reminder sweep finished', result);
  return result;
};

export const initDewormingReminderWorker = () => {
  const worker = new Worker(
    DEWORMING_REMINDER_QUEUE,
    async (job: Job) => {
      const now = new Date();
      logger.info('Deworming reminder sweep started (job)', { jobId: job.id });

      const result = await runDewormingReminderSweep({ now, limit: 500 });

      logger.info('Deworming reminder sweep completed (job)', { jobId: job.id, ...result });
      return result;
    },
    {
      connection: redisConnection as any,
      concurrency: 1,
    }
  );

  worker.on('completed', (job) => {
    logger.info('Deworming reminder job completed', { jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('Deworming reminder job failed', {
      jobId: job?.id,
      error: err.message,
      stack: err.stack,
    });
  });

  logger.info('Deworming Reminder Worker initialized');
  return worker;
};
