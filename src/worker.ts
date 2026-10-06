import dns from 'node:dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

import dotenv from 'dotenv';
dotenv.config();

import { connectDB } from './Config/db';
import { isRedisQueueEnabled } from './Config/queueMode';
import logger from './Utils/logger';

import { initAgroWorker } from './Workers/agroJobs.worker';
import { initCarbonAccrualWorker } from './Workers/carbonAccrual.worker';
import { initSweeps } from './Schedulers/sweeps';

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

  const workers = [initAgroWorker(), initCarbonAccrualWorker()].filter(Boolean);

  initSweeps();

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
