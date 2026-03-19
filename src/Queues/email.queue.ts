import { Queue } from "bullmq";
import { redisConnection } from "../Config/redis";
import logger from "../Utils/logger";

export const EMAIL_QUEUE = "email-queue";

const emailQueue = new Queue(EMAIL_QUEUE, {
  connection: redisConnection as any,
});

export const addEmailToQueue = async (to: string, subject: string, html: string) => {
  try {
    await emailQueue.add(
      "send-email",
      { to, subject, html },
      {
        attempts: 5,
        backoff: { type: "exponential", delay: 10000 },
        removeOnComplete: true,
      }
    );
    logger.debug(`Email job added to queue for: ${to}`);
  } catch (error: any) {
    logger.error(`Failed to add email to queue: ${error.message}`);
  }
};
