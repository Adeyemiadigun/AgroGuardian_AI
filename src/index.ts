import dns from 'node:dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import type { Express , Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { connectDB } from './Config/db';
import logger from './Utils/logger';
import passport from './Config/passport';
import authRoutes from './Routes/auth.routes';
import farmRoutes from './Routes/farm.routes';
import diagnosisRoutes from './Routes/diagnosis.routes';
import weatherRoutes from './Routes/weather.routes';
import resilienceRoutes from './Routes/resilience.routes';

// Workers & Queues
import { initResilienceWorker } from './Workers/resilience.worker';
<<<<<<< HEAD
import { initEmailWorker } from './Workers/email.worker';
import { initWeatherSyncWorker } from './Workers/weatherSync.worker';
import { initDailyWeatherSync } from './Queues/weatherSync.queue';
import { initDiagnosisWorker } from './Workers/diagnosis.worker';
=======
import practiceRoutes from './Routes/practice.routes';
import creditRoutes from './Routes/credit.routes';
import { seedDatabase } from './Services/seed.service';
>>>>>>> f546233555208be85a8c21dcf4805b8c37c53884

const app: Express = express();
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
    seedDatabase();
});

initResilienceWorker();
initEmailWorker();
initWeatherSyncWorker();
initDailyWeatherSync(); 
initDiagnosisWorker(); 

app.use(cors());
app.use(express.json());
app.use(passport.initialize());

app.use('/api/auth', authRoutes);
app.use('/api/farms', farmRoutes);
app.use('/api/diagnosis', diagnosisRoutes);
app.use('/api/weather', weatherRoutes);
<<<<<<< HEAD
app.use('/api/resilience', resilienceRoutes);
=======
app.use('/api/practices', practiceRoutes);
app.use('/api/credits', creditRoutes);
>>>>>>> f546233555208be85a8c21dcf4805b8c37c53884

app.get('/', (req: Request, res: Response) => {
    logger.info('AgroGuardian AI API is running...')
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
