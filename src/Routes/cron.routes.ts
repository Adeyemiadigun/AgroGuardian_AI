import { Router } from 'express';

// Deprecated: Cron-triggered feeding reminders were for serverless hosting.
// On Render, reminders run via BullMQ background workers + repeatable jobs.

const router = Router();

router.all('*', (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'Cron endpoints are disabled. Use BullMQ background workers on Render.',
  });
});

export default router;
