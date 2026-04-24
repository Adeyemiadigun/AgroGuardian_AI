import { Router } from 'express';
import logger from '../Utils/logger';
import { runFeedingReminderSweep } from '../Workers/feedingReminder.worker';

const router = Router();

// Vercel Cron triggers a GET request and uses user-agent: vercel-cron/1.0
// This endpoint allows Vercel Cron without hardcoding secrets in the repo.
router.get('/feeding-reminders', async (req, res) => {
  try {
    const ua = String(req.headers['user-agent'] || '');
    const isVercelCron = /vercel-cron\/1\.0/i.test(ua);

    if (!isVercelCron) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const windowMinutes = Math.max(
      1,
      parseInt(process.env.FEEDING_REMINDER_WINDOW_MINUTES || '15', 10) || 15
    );

    const result = await runFeedingReminderSweep({
      now: new Date(),
      windowMinutes,
      limit: 500,
      source: 'cron',
    });

    return res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error(`Cron feeding reminder sweep failed: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Cron sweep failed' });
  }
});

// Manual trigger (local/admin): /api/cron/feeding-reminders/:secret
router.get('/feeding-reminders/:secret', async (req, res) => {
  try {
    const expected = (process.env.CRON_SECRET || '').trim();
    const provided = String(req.params.secret || '').trim();

    if (!expected) {
      return res.status(500).json({ success: false, message: 'CRON_SECRET is not configured' });
    }

    if (provided !== expected) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const windowMinutes = Math.max(
      1,
      parseInt(process.env.FEEDING_REMINDER_WINDOW_MINUTES || '15', 10) || 15
    );

    const result = await runFeedingReminderSweep({
      now: new Date(),
      windowMinutes,
      limit: 500,
      source: 'cron',
    });

    return res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error(`Cron feeding reminder sweep failed: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Cron sweep failed' });
  }
});

export default router;
