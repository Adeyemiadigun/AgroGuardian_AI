import { isRedisQueueEnabled } from '../Config/queueMode';
import { enqueueJob } from '../Queues/agroJobs.queue';
import { runWeatherSync } from '../Services/weather-sync.processor';
import logger from '../Utils/logger';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/**
 * In-process periodic schedulers (setInterval/setTimeout).
 *
 * Replaces the previous BullMQ repeatable jobs: repeatables are a
 * disproportionate source of Redis commands (repeat:scheduler keys are
 * re-scanned constantly and force every worker's blocking pop down to a
 * 10s cycle). Timers cost zero Redis commands; only the job they enqueue
 * (if any) touches Redis.
 *
 * Schedules are wall-clock aligned to match the old cron patterns:
 * - sub-daily intervals fire on boundaries since UTC midnight (e.g. 15-min
 *   -> :00/:15/:30/:45, hourly -> :00, 3-hourly -> 00/03/06/...)
 * - daily schedules fire at the exact hour the old cron used.
 *
 * All schedules are only active in QUEUE_MODE=redis (except the weather
 * sync inline dev path, mirroring previous behavior).
 */
type Schedule = {
  everyMs?: number;        // fixed interval, aligned to UTC midnight
  atHoursUTC?: number[];   // fixed daily hour(s), e.g. [6] or [6, 18]
  bucketMs?: number;       // dedup window for enqueue jobIds
};

const SPECS = {
  weather: {
    hourly: { everyMs: HOUR },
    '3-hourly': { everyMs: 3 * HOUR },
    '6-hourly': { everyMs: 6 * HOUR },
    daily: { atHoursUTC: [6], bucketMs: DAY },
    'twice-daily': { atHoursUTC: [6, 18], bucketMs: 12 * HOUR },
  } as Record<string, Schedule>,
  feeding: {
    '15-min': { everyMs: 15 * MIN, bucketMs: 15 * MIN },
    '30-min': { everyMs: 30 * MIN, bucketMs: 30 * MIN },
    hourly: { everyMs: HOUR, bucketMs: HOUR },
  } as Record<string, Schedule>,
  vaccination: {
    hourly: { everyMs: HOUR, bucketMs: HOUR },
    '6-hourly': { everyMs: 6 * HOUR, bucketMs: 6 * HOUR },
    daily: { atHoursUTC: [7], bucketMs: DAY },
  } as Record<string, Schedule>,
  deworming: {
    hourly: { everyMs: HOUR, bucketMs: HOUR },
    '6-hourly': { everyMs: 6 * HOUR, bucketMs: 6 * HOUR },
    daily: { atHoursUTC: [7], bucketMs: DAY },
  } as Record<string, Schedule>,
  breeding: {
    hourly: { everyMs: HOUR, bucketMs: HOUR },
    '3-hourly': { everyMs: 3 * HOUR, bucketMs: 3 * HOUR },
    '6-hourly': { everyMs: 6 * HOUR, bucketMs: 6 * HOUR },
    daily: { atHoursUTC: [6], bucketMs: DAY },
  } as Record<string, Schedule>,
};

const DEFAULTS: Record<keyof typeof SPECS, string> = {
  weather: '6-hourly',
  feeding: '15-min',
  vaccination: 'hourly',
  deworming: 'hourly',
  breeding: 'hourly',
};

const ENV_KEYS: Record<keyof typeof SPECS, string> = {
  weather: 'WEATHER_SYNC_INTERVAL',
  feeding: 'FEEDING_REMINDER_INTERVAL',
  vaccination: 'VACCINATION_REMINDER_INTERVAL',
  deworming: 'DEWORMING_REMINDER_INTERVAL',
  breeding: 'BREEDING_FOLLOWUP_REMINDER_INTERVAL',
};

const resolveSpec = (name: keyof typeof SPECS): { interval: string; schedule: Schedule } => {
  const envKey = ENV_KEYS[name];
  const interval = process.env[envKey] || DEFAULTS[name];
  const schedule = SPECS[name][interval];
  if (!schedule) {
    logger.warn(`Unknown ${envKey}="${interval}"; falling back to ${DEFAULTS[name]}`);
    return { interval: DEFAULTS[name], schedule: SPECS[name][DEFAULTS[name]] };
  }
  return { interval, schedule };
};

const nextDelayMs = (schedule: Schedule): number => {
  const now = new Date();

  if (schedule.everyMs) {
    const msSinceMidnight =
      ((now.getUTCHours() * 60 + now.getUTCMinutes()) * 60 + now.getUTCSeconds()) * 1000 + now.getUTCMilliseconds();
    const elapsed = msSinceMidnight % schedule.everyMs;
    return elapsed === 0 ? schedule.everyMs : schedule.everyMs - elapsed;
  }

  const hours = schedule.atHoursUTC || [0];
  const nextHour = hours.find((h) => h > now.getUTCHours()) ?? hours[0] + 24;
  const deltaMs =
    nextHour * HOUR -
    ((now.getUTCMinutes() * 60 + now.getUTCSeconds()) * 1000 + now.getUTCMilliseconds());
  return deltaMs;
};

const timers: NodeJS.Timeout[] = [];

const scheduleEvery = (label: string, schedule: Schedule, fire: () => void) => {
  const periodMs = schedule.everyMs ?? (schedule.atHoursUTC && schedule.atHoursUTC.length > 1 ? 12 * HOUR : DAY);

  const start = () => {
    fire();
    timers.push(setInterval(fire, periodMs));
  };

  timers.push(setTimeout(start, nextDelayMs(schedule)));
  logger.info(`${label} scheduler armed`, { firstRunInMs: nextDelayMs(schedule), periodMs });
};

const bucketId = (prefix: string, schedule: Schedule) => {
  const bucketMs = schedule.bucketMs ?? DAY;
  return `${prefix}-${Math.floor(Date.now() / bucketMs)}`;
};

const sweepOpts = (jobId: string) => ({
  jobId,
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 60000 },
  removeOnComplete: { count: 50 },
  removeOnFail: { count: 20 },
});

let initialized = false;

export const initSweeps = () => {
  if (initialized) return;
  initialized = true;

  if (!isRedisQueueEnabled()) {
    // Weather sync keeps its dev-friendly inline timer (previous behavior);
    // reminder sweeps stay disabled in inline mode (emails would be
    // dropped anyway since the email queue is disabled too).
    const { interval, schedule } = resolveSpec('weather');
    if (schedule.everyMs) {
      logger.warn(`Weather sync scheduler running inline every ~${Math.round(schedule.everyMs / HOUR)}h (QUEUE_MODE=inline)`);
      const run = () =>
        runWeatherSync({ interval, triggeredBy: 'periodic' }).catch((e) =>
          logger.error(`(inline) Weather sync failed: ${e.message}`)
        );
      run();
      timers.push(setInterval(run, schedule.everyMs));
    }

    logger.warn('Feeding/vaccination/deworming/breeding reminder sweeps disabled (QUEUE_MODE=inline).');
    return;
  }

  const weather = resolveSpec('weather');
  scheduleEvery('Weather sync', weather.schedule, () => {
    enqueueJob(
      'weather-sync',
      { interval: weather.interval, startedAt: new Date().toISOString(), triggeredBy: 'periodic' },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 60000 },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 20 },
      }
    ).catch(() => undefined); // enqueueJob logs its own errors
  });

  const feeding = resolveSpec('feeding');
  scheduleEvery('Feeding reminder', feeding.schedule, () => {
    enqueueJob(
      'sweep-feeding-reminders',
      { interval: feeding.interval, startedAt: new Date().toISOString() },
      sweepOpts(bucketId('sweep-feeding', feeding.schedule))
    ).catch(() => undefined);
  });

  const vaccination = resolveSpec('vaccination');
  scheduleEvery('Vaccination reminder', vaccination.schedule, () => {
    enqueueJob(
      'sweep-vaccination-reminders',
      { interval: vaccination.interval, startedAt: new Date().toISOString() },
      sweepOpts(bucketId('sweep-vaccination', vaccination.schedule))
    ).catch(() => undefined);
  });

  const deworming = resolveSpec('deworming');
  scheduleEvery('Deworming reminder', deworming.schedule, () => {
    enqueueJob(
      'sweep-deworming-reminders',
      { interval: deworming.interval, startedAt: new Date().toISOString() },
      sweepOpts(bucketId('sweep-deworming', deworming.schedule))
    ).catch(() => undefined);
  });

  const breeding = resolveSpec('breeding');
  scheduleEvery('Breeding follow-up reminder', breeding.schedule, () => {
    enqueueJob(
      'sweep-breeding-followup',
      { interval: breeding.interval, startedAt: new Date().toISOString() },
      sweepOpts(bucketId('sweep-breeding', breeding.schedule))
    ).catch(() => undefined);
  });

  logger.info('Sweep schedulers initialized', {
    weather: weather.interval,
    feeding: feeding.interval,
    vaccination: vaccination.interval,
    deworming: deworming.interval,
    breeding: breeding.interval,
  });
};
