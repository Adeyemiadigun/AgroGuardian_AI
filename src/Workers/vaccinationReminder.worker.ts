import { Worker, Job } from 'bullmq';
import { redisConnection } from '../Config/redis';
import { VACCINATION_REMINDER_QUEUE } from '../Queues/vaccinationReminder.queue';
import { LivestockVaccination } from '../Models/LivestockHealth';
import logger from '../Utils/logger';
import { createNotification } from '../Services/notification.service';
import { sendVaccinationReminderEmail } from '../Services/email.service';

export type VaccinationReminderSweepResult = {
  remindersSent: number;
  vaccinationsScanned: number;
  vaccinationsMatched: number;
  vaccinationsUpdated: number;
  skips: Record<string, number>;
  email: { attempted: number; queued: number; failed: number; missingEmail: number };
  notifications: { attempted: number; created: number; failed: number };
};

const getAnimalName = (livestock: any) => livestock?.name || livestock?.tagId || 'Animal';

export const runVaccinationReminderSweep = async (opts: {
  now: Date;
  limit?: number;
}): Promise<VaccinationReminderSweepResult> => {
  const now = opts.now;
  const limit = opts.limit ?? 500;

  const daysAhead = Math.max(0, parseInt(process.env.VACCINATION_REMINDER_DAYS_AHEAD || '0', 10) || 0);
  const windowHours = Math.max(1, parseInt(process.env.VACCINATION_REMINDER_WINDOW_HOURS || '24', 10) || 24);
  const verbose = process.env.VACCINATION_REMINDER_DEBUG === 'true';

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

  logger.info('Vaccination reminder sweep started', {
    now: now.toISOString(),
    daysAhead,
    windowHours,
    lower: lower.toISOString(),
    upper: upper.toISOString(),
    limit,
  });

  const vaccinations = await LivestockVaccination.find({
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
  let vaccinationsScanned = 0;
  let vaccinationsMatched = 0;
  let vaccinationsUpdated = 0;

  for (const v of vaccinations) {
    vaccinationsScanned++;

    const due = (v as any).nextDueDate ? new Date((v as any).nextDueDate) : null;
    if (!due || Number.isNaN(due.getTime())) {
      skips.missingDueDate++;
      continue;
    }

    const reminderKey = `${due.toISOString()}|ahead=${daysAhead}`;
    if ((v as any).lastReminderKey === reminderKey) {
      skips.alreadyReminded++;
      continue;
    }

    const farm: any = (v as any).farmId;
    const livestock: any = (v as any).livestockId;
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
    const vaccineName = String((v as any).vaccineName || 'vaccination');

    const dueText = due.toLocaleDateString();
    const title = 'Vaccination reminder';
    const message = `${animalName} is due for ${vaccineName} on ${dueText}.`;
    const link = livestockId ? `/livestock/${livestockId}` : (farmId ? `/livestock?farmId=${farmId}` : undefined);

    if (verbose) {
      logger.info('Vaccination reminder matched', {
        vaccinationId: (v as any)._id?.toString?.(),
        ownerEmail: owner?.email,
        farmName,
        livestockId,
        vaccineName,
        due: due.toISOString(),
      });
    }

    notifications.attempted++;
    try {
      await createNotification(ownerId, title, message, 'treatment', link);
      notifications.created++;
    } catch (err: any) {
      notifications.failed++;
      logger.error(`Failed to create vaccination notification: ${err.message}`);
    }

    if (owner?.email) {
      email.attempted++;
      try {
        await sendVaccinationReminderEmail(owner.email, {
          dueDate: due,
          vaccineName,
          farmName,
          livestockName: animalName,
        });
        email.queued++;
      } catch (err: any) {
        email.failed++;
        logger.error(`Failed to queue vaccination reminder email to ${owner.email}: ${err.message}`);
      }
    } else {
      email.missingEmail++;
    }

    (v as any).lastReminderKey = reminderKey;
    (v as any).lastReminderSentAt = now;
    try {
      await (v as any).save();
      vaccinationsUpdated++;
      vaccinationsMatched++;
      remindersSent++;
    } catch (err: any) {
      skips.saveFailed++;
      logger.error(`Failed to update vaccination reminder key: ${err.message}`);
    }
  }

  const result: VaccinationReminderSweepResult = {
    remindersSent,
    vaccinationsScanned,
    vaccinationsMatched,
    vaccinationsUpdated,
    skips,
    email,
    notifications,
  };

  logger.info('Vaccination reminder sweep finished', result);
  return result;
};

export const initVaccinationReminderWorker = () => {
  const worker = new Worker(
    VACCINATION_REMINDER_QUEUE,
    async (job: Job) => {
      const now = new Date();
      logger.info('Vaccination reminder sweep started (job)', { jobId: job.id });

      const result = await runVaccinationReminderSweep({ now, limit: 500 });

      logger.info('Vaccination reminder sweep completed (job)', { jobId: job.id, ...result });
      return result;
    },
    {
      connection: redisConnection as any,
      concurrency: 1,
    }
  );

  worker.on('completed', (job) => {
    logger.info('Vaccination reminder job completed', { jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('Vaccination reminder job failed', {
      jobId: job?.id,
      error: err.message,
      stack: err.stack,
    });
  });

  logger.info('Vaccination Reminder Worker initialized');
  return worker;
};
