import { Worker, Job } from 'bullmq';
import { redisConnection } from '../Config/redis';
import { FEEDING_REMINDER_QUEUE } from '../Queues/feedingReminder.queue';
import { LivestockFeedingSchedule, LivestockFeeding } from '../Models/LivestockManagement';
import logger from '../Utils/logger';
import { sendFeedingReminderEmail, sendFeedingReminderSMS } from '../Services/email.service';
import { createNotification } from '../Services/notification.service';

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const getLocalTimeHHmm = (d: Date, timeZone: string) => {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
  }
};

const getLocalDateKey = (d: Date, timeZone: string) => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  }
};

const getLocalWeekday = (d: Date, timeZone: string) => {
  try {
    const wk = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(d);
    return WEEKDAY_MAP[wk] ?? d.getUTCDay();
  } catch {
    return d.getDay();
  }
};

const toMinutes = (hhmm: string) => {
  const [hh, mm] = hhmm.split(':').map((x) => parseInt(x, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
};

export type FeedingReminderSweepResult = {
  remindersSent: number;
  schedulesUpdated: number;
  schedulesScanned: number;
  schedulesMatched: number;
  skips: Record<string, number>;
  sms: { attempted: number; sent: number; failed: number; missingPhone: number };
  email: { attempted: number; queued: number; failed: number; missingEmail: number };
  notifications: { attempted: number; created: number; failed: number };
};

const maskPhone = (raw: unknown) => {
  const s = String(raw || '');
  const digits = s.replace(/\D/g, '');
  if (digits.length <= 4) return '****';
  return `***${digits.slice(-4)}`;
};

export const runFeedingReminderSweep = async (opts: {
  now: Date;
  windowMinutes: number;
  limit?: number;
  source?: 'worker' | 'cron';
}): Promise<FeedingReminderSweepResult> => {
  const now = opts.now;
  const windowMinutes = opts.windowMinutes;
  const limit = opts.limit ?? 500;
  const source = opts.source || 'worker';
  const verbose = process.env.FEEDING_REMINDER_DEBUG === 'true';

  const skips: Record<string, number> = {
    noTimes: 0,
    dowMismatch: 0,
    invalidNow: 0,
    missingOwner: 0,
    alreadyFed: 0,
    outOfWindow: 0,
    alreadyReminded: 0,
    scheduleSaveFailed: 0,
  };

  const sms = { attempted: 0, sent: 0, failed: 0, missingPhone: 0 };
  const email = { attempted: 0, queued: 0, failed: 0, missingEmail: 0 };
  const notifications = { attempted: 0, created: 0, failed: 0 };

  logger.info('Feeding reminder sweep started', {
    source,
    now: now.toISOString(),
    windowMinutes,
    limit,
  });

  const schedules = await LivestockFeedingSchedule.find({ enabled: true })
    .populate('farmId', 'name')
    .populate('livestockId', 'name tagId species')
    .populate('owner', 'email firstName lastName phoneNumber')
    .limit(limit);

  logger.info('Feeding reminder schedules loaded', { source, count: schedules.length });

  let remindersSent = 0;
  let schedulesUpdated = 0;
  let schedulesScanned = 0;
  let schedulesMatched = 0;

  for (const schedule of schedules) {
    schedulesScanned++;

    try {
      const scheduleId = (schedule as any)._id?.toString?.() || 'unknown';
      const tz = (schedule as any).timezone || 'Africa/Lagos';
      const times: string[] = Array.isArray((schedule as any).timesOfDay) ? (schedule as any).timesOfDay : [];
      if (!times.length) {
        skips.noTimes++;
        continue;
      }

      const dow = getLocalWeekday(now, tz);
      const allowedDows: number[] | undefined = Array.isArray((schedule as any).daysOfWeek) && (schedule as any).daysOfWeek.length
        ? (schedule as any).daysOfWeek
        : undefined;
      if (allowedDows && !allowedDows.includes(dow)) {
        skips.dowMismatch++;
        continue;
      }

      const dateKey = getLocalDateKey(now, tz);
      const nowHHmm = getLocalTimeHHmm(now, tz);
      const nowMin = toMinutes(nowHHmm);
      if (nowMin === null) {
        skips.invalidNow++;
        continue;
      }

      const owner: any = (schedule as any).owner;
      const ownerId = owner?._id?.toString?.();
      if (!ownerId) {
        skips.missingOwner++;
        continue;
      }

      // SKIP if already fed in last 4 hours (only when schedule targets a specific animal)
      const scheduleLivestockId = (schedule as any).livestockId?._id;
      if (scheduleLivestockId) {
        const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);
        const alreadyFed = await LivestockFeeding.findOne({
          farmId: (schedule as any).farmId?._id,
          livestockId: scheduleLivestockId,
          feedingTime: { $gte: fourHoursAgo }
        }).lean();

        if (alreadyFed) {
          skips.alreadyFed++;
          if (verbose) {
            logger.info('Skipping feeding reminder (already fed in last 4h)', {
              scheduleId,
              owner: owner?.email,
              livestockId: String(scheduleLivestockId),
            });
          }
          continue;
        }
      }

      const toEmail = owner?.email;
      const phoneNumber = owner?.phoneNumber;

      const farmName = (schedule as any).farmId?.name;
      const farmId = (schedule as any).farmId?._id?.toString?.();
      const livestockName = (schedule as any).livestockId?.name || (schedule as any).livestockId?.tagId;

      const lastKeys: string[] = Array.isArray((schedule as any).lastReminderKeys) ? (schedule as any).lastReminderKeys : [];
      let touched = false;

      for (const t of times) {
        schedulesMatched++;
        if (typeof t !== 'string' || !/^\d{2}:\d{2}$/.test(t)) continue;
        const targetMin = toMinutes(t);
        if (targetMin === null) continue;

        const withinWindow = nowMin >= targetMin && nowMin < targetMin + windowMinutes;
        if (!withinWindow) {
          skips.outOfWindow++;
          continue;
        }

        const reminderKey = `${dateKey}-${t}`;
        if (lastKeys.includes(reminderKey)) {
          skips.alreadyReminded++;
          continue;
        }

        if (verbose) {
          logger.info('Feeding reminder matched time window', {
            scheduleId,
            time: t,
            tz,
            nowHHmm,
            windowMinutes,
            owner: owner?.email,
            phone: maskPhone(phoneNumber),
          });
        }

        const title = `Feeding reminder (${t})`;
        const message = `It's time to feed${farmName ? ` at ${farmName}` : ''}${livestockName ? ` (${livestockName})` : ''}.`;
        const link = farmId ? `/livestock/feeding?farmId=${farmId}` : undefined;

        notifications.attempted++;
        try {
          await createNotification(ownerId, title, message, 'system', link);
          notifications.created++;
        } catch (err: any) {
          notifications.failed++;
          logger.error(`Failed to create in-app feeding notification: ${err.message}`);
        }

        if (toEmail) {
          email.attempted++;
          try {
            await sendFeedingReminderEmail(toEmail, {
              time: t,
              timezone: tz,
              farmName,
              livestockName,
            });
            email.queued++;
          } catch (err: any) {
            email.failed++;
            logger.error(`Failed to queue feeding reminder email to ${toEmail}: ${err.message}`);
          }
        } else {
          email.missingEmail++;
        }

        if (phoneNumber) {
          sms.attempted++;
          try {
            await sendFeedingReminderSMS(phoneNumber, {
              time: t,
              farmName,
              livestockName,
            });
            sms.sent++;
          } catch (err: any) {
            sms.failed++;
            logger.error(`Failed to send feeding SMS to ${maskPhone(phoneNumber)}: ${err.message}`);
          }
        } else {
          sms.missingPhone++;
        }

        lastKeys.push(reminderKey);
        remindersSent++;
        touched = true;
      }

      if (touched) {
        (schedule as any).lastReminderKeys = lastKeys.slice(-50);
        try {
          await (schedule as any).save();
          schedulesUpdated++;
        } catch (err: any) {
          skips.scheduleSaveFailed++;
          logger.error(`Failed to update schedule lastReminderKeys: ${err.message}`);
        }
      }
    } catch (err: any) {
      logger.error(`Feeding reminder schedule sweep error: ${err.message}`);
    }
  }

  const result: FeedingReminderSweepResult = {
    remindersSent,
    schedulesUpdated,
    schedulesScanned,
    schedulesMatched,
    skips,
    sms,
    email,
    notifications,
  };

  logger.info('Feeding reminder sweep finished', { source, ...result });

  return result;
};

export const initFeedingReminderWorker = () => {
  const worker = new Worker(
    FEEDING_REMINDER_QUEUE,
    async (job: Job) => {
      const now = new Date();
      const windowMinutes = Math.max(1, parseInt(process.env.FEEDING_REMINDER_WINDOW_MINUTES || '15', 10) || 15);

      logger.info('Feeding reminder sweep started', { jobId: job.id, windowMinutes });

      const result = await runFeedingReminderSweep({
        now,
        windowMinutes,
        limit: 500,
        source: 'worker',
      });

      logger.info('Feeding reminder sweep completed', {
        jobId: job.id,
        ...result,
      });

      return result;
    },
    {
      connection: redisConnection as any,
      concurrency: 1,
    }
  );

  worker.on('completed', (job) => {
    logger.info('Feeding reminder job completed', { jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('Feeding reminder job failed', {
      jobId: job?.id,
      error: err.message,
      stack: err.stack,
    });
  });

  logger.info('Feeding Reminder Worker initialized');
  return worker;
};
