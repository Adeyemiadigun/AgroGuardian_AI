import { Worker, Job } from 'bullmq';
import { redisConnection } from '../Config/redis';
import { FEEDING_REMINDER_QUEUE } from '../Queues/feedingReminder.queue';
import { LivestockFeedingSchedule } from '../Models/LivestockManagement';
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
    // en-CA => YYYY-MM-DD
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

export const initFeedingReminderWorker = () => {
  const worker = new Worker(
    FEEDING_REMINDER_QUEUE,
    async (job: Job) => {
      const now = new Date();
      const windowMinutes = Math.max(1, parseInt(process.env.FEEDING_REMINDER_WINDOW_MINUTES || '15', 10) || 15);

      logger.info('Feeding reminder sweep started', { jobId: job.id, windowMinutes });

      const schedules = await LivestockFeedingSchedule.find({ enabled: true })
        .populate('farmId', 'name')
        .populate('livestockId', 'name tagId species')
        .populate('owner', 'email firstName lastName phoneNumber')
        .limit(500);

      let remindersSent = 0;
      let schedulesUpdated = 0;

      for (const schedule of schedules) {
        const tz = (schedule as any).timezone || 'Africa/Lagos';
        const times: string[] = Array.isArray((schedule as any).timesOfDay) ? (schedule as any).timesOfDay : [];
        if (!times.length) continue;

        const dow = getLocalWeekday(now, tz);
        const allowedDows: number[] | undefined = Array.isArray((schedule as any).daysOfWeek) && (schedule as any).daysOfWeek.length
          ? (schedule as any).daysOfWeek
          : undefined;
        if (allowedDows && !allowedDows.includes(dow)) continue;

        const dateKey = getLocalDateKey(now, tz);
        const nowHHmm = getLocalTimeHHmm(now, tz);
        const nowMin = toMinutes(nowHHmm);
        if (nowMin === null) continue;

        const owner: any = (schedule as any).owner;
        const toEmail = owner?.email;
        const phoneNumber = owner?.phoneNumber;
        const ownerId = owner?._id?.toString?.();
        if (!ownerId) continue;

        const farmName = (schedule as any).farmId?.name;
        const farmId = (schedule as any).farmId?._id?.toString?.();
        const livestockName = (schedule as any).livestockId?.name || (schedule as any).livestockId?.tagId;

        const lastKeys: string[] = Array.isArray((schedule as any).lastReminderKeys) ? (schedule as any).lastReminderKeys : [];
        let touched = false;

        for (const t of times) {
          if (typeof t !== 'string' || !/^\d{2}:\d{2}$/.test(t)) continue;
          const targetMin = toMinutes(t);
          if (targetMin === null) continue;

          const withinWindow = nowMin >= targetMin && nowMin < targetMin + windowMinutes;
          if (!withinWindow) continue;

          const reminderKey = `${dateKey}-${t}`;
          if (lastKeys.includes(reminderKey)) continue;

          const title = `Feeding reminder (${t})`;
          const message = `It's time to feed${farmName ? ` at ${farmName}` : ''}${livestockName ? ` (${livestockName})` : ''}.`;
          const link = farmId ? `/livestock/feeding?farmId=${farmId}` : undefined;

          // In-app notification
          await createNotification(ownerId, title, message, 'system', link);

          // Email (best-effort)
          if (toEmail) {
            await sendFeedingReminderEmail(toEmail, {
              time: t,
              timezone: tz,
              farmName,
              livestockName,
            });
          }

          // SMS (best-effort)
          if (phoneNumber) {
            try {
              await sendFeedingReminderSMS(phoneNumber, {
                time: t,
                farmName,
                livestockName,
              });
            } catch (err: any) {
              logger.error(`Failed to send feeding SMS to ${phoneNumber}: ${err.message}`);
            }
          }

          lastKeys.push(reminderKey);
          remindersSent++;
          touched = true;
        }

        if (touched) {
          // keep last 50 keys
          (schedule as any).lastReminderKeys = lastKeys.slice(-50);
          await (schedule as any).save();
          schedulesUpdated++;
        }
      }

      logger.info('Feeding reminder sweep completed', {
        jobId: job.id,
        remindersSent,
        schedulesUpdated,
      });

      return { remindersSent, schedulesUpdated };
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
