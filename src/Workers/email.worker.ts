import { Worker, Job } from "bullmq";
import { redisConnection } from "../Config/redis";
import { EMAIL_QUEUE } from "../Queues/email.queue";
import { sendBrevoEmail } from "../Services/email.service";
import logger from "../Utils/logger";

export const initEmailWorker = () => {
  const worker = new Worker(
    EMAIL_QUEUE,
    async (job: Job) => {
      const { to, subject, html } = job.data;
      logger.info(`Processing email for: ${to} - Subject: ${subject}`);
      
      await sendBrevoEmail(to, subject, html);
    },
    { 
      connection: redisConnection as any,
      concurrency: 2 
    }
  );

  worker.on("completed", (job) => {
    logger.info(`Email job ${job.id} sent successfully.`);
  });

  worker.on("failed", (job, err) => {
    logger.error(`Email job ${job?.id} failed to send: ${err.message}`);
  });

  return worker;
};
