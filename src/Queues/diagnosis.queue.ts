import { Queue } from "bullmq";
import { redisConnection } from "../Config/redis";
import logger from "../Utils/logger";

export const DIAGNOSIS_QUEUE = "diagnosis-queue";

const diagnosisQueue = new Queue(DIAGNOSIS_QUEUE, {
  connection: redisConnection as any,
});

export const addDiagnosisJob = async (data: {
  diagnosisId: string;
  imageUrl: string;
  cropType: string;
  farmId: string;
  userId: string;
}) => {
  try {
    await diagnosisQueue.add("process-diagnosis", data, {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: true,
    });
    logger.debug(`Diagnosis job added for ID: ${data.diagnosisId}`);
  } catch (error: any) {
    logger.error(`Failed to add diagnosis job: ${error.message}`);
  }
};
