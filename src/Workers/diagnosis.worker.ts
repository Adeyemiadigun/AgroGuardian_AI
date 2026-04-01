import { Worker, Job } from "bullmq";
import { redisConnection } from "../Config/redis";
import { DIAGNOSIS_QUEUE } from "../Queues/diagnosis.queue";
import CropDiagnosis from "../Models/CropDiagnosis";
import DiagnosisChat from "../Models/DiagnosisChat";
import { analyzeCropImage, getModelName } from "../Utils/geminiClient";
import { addResilienceSyncJob } from "../Queues/resilience.queue";
import logger from "../Utils/logger";
import axios from "axios";

export const initDiagnosisWorker = () => {
  const worker = new Worker(
    DIAGNOSIS_QUEUE,
    async (job: Job) => {
      const { diagnosisId, imageUrls, cropType, farmId, userId } = job.data;
      logger.info(`AI Worker analyzing diagnosis: ${diagnosisId} with ${imageUrls?.length || 0} images`);

      try {
        const aiResult = await analyzeCropImage(imageUrls, cropType);

        const diagnosis = await CropDiagnosis.findByIdAndUpdate(
          diagnosisId,
          {
            diagnosis: aiResult.diagnosis,
            confidence: aiResult.confidence,
            symptoms: aiResult.symptoms,
            treatment: aiResult.treatment,
            treatmentPlan: aiResult.treatmentPlan,
            prevention: aiResult.prevention,
            severity: aiResult.severity,
            status: "detected",
            aiModel: getModelName(),
          },
          { new: true }
        );

        if (!diagnosis) throw new Error("Diagnosis record not found during update");

        await DiagnosisChat.create({
          diagnosisId: diagnosis._id,
          userId,
          messages: [
            {
              role: "assistant",
              content: `I've analyzed your ${cropType} image. Diagnosis: **${aiResult.diagnosis}** (${aiResult.confidence}% confidence, ${aiResult.severity} severity). You can ask me follow-up questions about treatment, prevention, or anything else.`,
              timestamp: new Date(),
            },
          ],
        });

        await addResilienceSyncJob(farmId, userId);

        logger.info(`AI Analysis complete for diagnosis: ${diagnosisId}`);
      } catch (error: any) {
        logger.error(`AI Worker failed for diagnosis ${diagnosisId}: ${error.message}`);
        throw error; 
      }
    },
    { 
      connection: redisConnection as any,
      concurrency: 3 
    }
  );

  return worker;
};
