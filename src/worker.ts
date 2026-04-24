import dns from 'node:dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

import dotenv from 'dotenv';
dotenv.config();

import { connectDB } from './Config/db';
import { isRedisQueueEnabled } from './Config/queueMode';
import logger from './Utils/logger';

import { initResilienceWorker } from './Workers/resilience.worker';
import { initEmailWorker } from './Workers/email.worker';
import { initWeatherSyncWorker } from './Workers/weatherSync.worker';
import { initDailyWeatherSync } from './Queues/weatherSync.queue';
import { initBreedingFollowUpReminderWorker } from './Workers/breedingFollowUpReminder.worker';
import { initBreedingFollowUpReminderSchedule } from './Queues/breedingFollowUpReminder.queue';
import { initDiagnosisWorker } from './Workers/diagnosis.worker';
import { initLivestockDiagnosisWorker } from './Workers/livestockDiagnosis.worker';
import { initLivestockHealthCheckWorker } from './Workers/livestockHealthCheck.worker';
import { initCarbonAccrualWorker } from './Workers/carbonAccrual.worker';
import { initFeedingReminderWorker } from './Workers/feedingReminder.worker';
import { initFeedingReminderSchedule } from './Queues/feedingReminder.queue';
import { initVaccinationReminderWorker } from './Workers/vaccinationReminder.worker';
import { initVaccinationReminderSchedule } from './Queues/vaccinationReminder.queue';
import { initDewormingReminderWorker } from './Workers/dewormingReminder.worker';
import { initDewormingReminderSchedule } from './Queues/dewormingReminder.queue';

const main = async () => {
  await connectDB();

  if (!isRedisQueueEnabled()) {
    logger.error('QUEUE_MODE is not "redis". Background workers require Redis. Set QUEUE_MODE=redis and configure REDIS_URL.');
    process.exit(1);
  }

  const runWorkers = process.env.RUN_WORKERS ? process.env.RUN_WORKERS === 'true' : true;
  if (!runWorkers) {
    logger.warn('RUN_WORKERS=false; worker process will exit.');
    return;
  }

  const workers = [
    initResilienceWorker(),
    initEmailWorker(),
    initWeatherSyncWorker(),
    initBreedingFollowUpReminderWorker(),
    initDiagnosisWorker(),
    initLivestockDiagnosisWorker(),
    initLivestockHealthCheckWorker(),
    initCarbonAccrualWorker(),
    initFeedingReminderWorker(),
    initVaccinationReminderWorker(),
    initDewormingReminderWorker(),
  ];

  const weatherSyncInterval = (process.env.WEATHER_SYNC_INTERVAL || '6-hourly') as any;
  await initDailyWeatherSync(weatherSyncInterval);

  const breedingReminderInterval = (process.env.BREEDING_FOLLOWUP_REMINDER_INTERVAL || 'hourly') as any;
  await initBreedingFollowUpReminderSchedule(breedingReminderInterval);

  const feedingReminderInterval = (process.env.FEEDING_REMINDER_INTERVAL || '15-min') as any;
  await initFeedingReminderSchedule(feedingReminderInterval);

  const vaccinationReminderInterval = (process.env.VACCINATION_REMINDER_INTERVAL || 'hourly') as any;
  await initVaccinationReminderSchedule(vaccinationReminderInterval);

  const dewormingReminderInterval = (process.env.DEWORMING_REMINDER_INTERVAL || 'hourly') as any;
  await initDewormingReminderSchedule(dewormingReminderInterval);

  logger.info('Background workers started', { workerCount: workers.length });

  process.on('SIGTERM', async () => {
    logger.warn('SIGTERM received; shutting down workers...');
    await Promise.allSettled(workers.map((w: any) => w?.close?.()));
    process.exit(0);
  });
};

process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled promise rejection', { reason });
});

process.on('uncaughtException', (err: any) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

main().catch((err: any) => {
  logger.error('Worker process failed to start', { error: err.message, stack: err.stack });
  process.exit(1);
});
