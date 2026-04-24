import dns from 'node:dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import type { Express , Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { connectDB } from './Config/db';
import { isRedisQueueEnabled } from './Config/queueMode';
import logger from './Utils/logger';
import passport from './Config/passport';

// Routes
import authRoutes from './Routes/auth.routes';
import farmRoutes from './Routes/farm.routes';
import diagnosisRoutes from './Routes/diagnosis.routes';
import weatherRoutes from './Routes/weather.routes';
import resilienceRoutes from './Routes/resilience.routes';
import practiceRoutes from './Routes/practice.routes';
import creditRoutes from './Routes/credit.routes';
import notificationRoutes from './Routes/notification.routes';
import consultationRoutes from './Routes/consultation.routes';
import livestockRoutes from './Routes/livestock.routes';
import livestockHealthRoutes from './Routes/livestock-health.routes';
import livestockDiagnosisRoutes from './Routes/livestock-diagnosis.routes';
import livestockFeedBreedingRoutes from './Routes/livestock-feed-breeding.routes';
import livestockInventoryRoutes from './Routes/livestock-inventory.routes';
import vetConsultationRoutes from './Routes/vet-consultation.routes';
import livestockAlertsRoutes from './Routes/livestock-alerts.routes';

// Workers & Queues
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

const app: Express = express();
const PORT = process.env.PORT || 5000;

connectDB()

// Initialize Workers (BullMQ)
// NOTE: BullMQ generates a lot of Redis commands; use QUEUE_MODE=inline for dev to avoid Upstash request caps.

let runWorkers = process.env.RUN_WORKERS
  ? process.env.RUN_WORKERS === 'true'
  : isRedisQueueEnabled();

if (runWorkers) {
  initResilienceWorker();
  initEmailWorker();
  initWeatherSyncWorker();

  const weatherSyncInterval = (process.env.WEATHER_SYNC_INTERVAL || '6-hourly') as any;
  initDailyWeatherSync(weatherSyncInterval);

  initBreedingFollowUpReminderWorker();
  const breedingReminderInterval = (process.env.BREEDING_FOLLOWUP_REMINDER_INTERVAL || 'hourly') as any;
  initBreedingFollowUpReminderSchedule(breedingReminderInterval);

  initDiagnosisWorker();
  initLivestockDiagnosisWorker();
  initLivestockHealthCheckWorker();
  initCarbonAccrualWorker();

  initFeedingReminderWorker();
  const feedingReminderInterval = (process.env.FEEDING_REMINDER_INTERVAL || '15-min') as any;
  initFeedingReminderSchedule(feedingReminderInterval);

  initVaccinationReminderWorker();
  const vaccinationReminderInterval = (process.env.VACCINATION_REMINDER_INTERVAL || 'hourly') as any;
  initVaccinationReminderSchedule(vaccinationReminderInterval);
} else {
  logger.warn('Queue workers are disabled (RUN_WORKERS=false or QUEUE_MODE=inline).');
}

app.use(cors({
    origin: [
        'http://localhost:5173',
        'https://agroguardian-frontend.vercel.app'
    ]}
));
app.use(express.json());
app.use(passport.initialize());

app.use('/api/auth', authRoutes);
app.use('/api/farms', farmRoutes);
app.use('/api/diagnosis', diagnosisRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/resilience', resilienceRoutes);
app.use('/api/practices', practiceRoutes);
app.use('/api/credits', creditRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/consultations', consultationRoutes);
app.use('/api/livestock', livestockRoutes);
app.use('/api/livestock-health', livestockHealthRoutes);
app.use('/api/livestock-diagnosis', livestockDiagnosisRoutes);
app.use('/api/livestock-management', livestockFeedBreedingRoutes);
app.use('/api/livestock-inventory', livestockInventoryRoutes);
app.use('/api/vet-consultations', vetConsultationRoutes);
app.use('/api/livestock-alerts', livestockAlertsRoutes);

app.get('/', (req: Request, res: Response) => {
    logger.info('AgroGuardian AI API is running...')
    res.send('AgroGuardian AI API is running...');
});

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    logger.error('Unhandled error', err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error',
    });
});

const server = app.listen(PORT, async () => {
    logger.info(`Server is running on port ${PORT}`);
});

server.timeout = 60000; 
