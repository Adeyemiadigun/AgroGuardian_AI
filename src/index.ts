import dns from 'node:dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import type { Express , Request, Response } from 'express';
import cors from 'cors';
import { connectDB } from './Config/db';
import logger from './Utils/logger';
import passport from './Config/passport';
import authRoutes from './Routes/auth.routes';
import farmRoutes from './Routes/farm.routes';

const app: Express = express();
const PORT = process.env.PORT || 5000;

connectDB();

app.use(cors());
app.use(express.json());
app.use(passport.initialize());

app.use('/api/auth', authRoutes);
app.use('/api/farms', farmRoutes);

app.get('/', (req: Request, res: Response) => {
    logger.info('AgroGuardian AI API is running...')
});

app.listen(PORT, async () => {
    logger.info(`Server is running on port ${PORT}`);
});