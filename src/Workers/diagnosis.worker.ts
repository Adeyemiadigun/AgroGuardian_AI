import { Worker, Job } from "bullmq";
import { redisConnection } from "../Config/redis";
import { DIAGNOSIS_QUEUE } from "../Queues/diagnosis.queue";
import CropDiagnosis from "../Models/CropDiagnosis";
import DiagnosisChat from "../Models/DiagnosisChat";
import { analyzeCropImage, getModelName } from "../Utils/geminiClient";
import { addResilienceSyncJob } from "../Queues/resilience.queue";
import logger from "../Utils/logger";
import Farm from "../Models/Farm";

export const initDiagnosisWorker = () => {
  const worker = new Worker(
    DIAGNOSIS_QUEUE,
    async (job: Job) => {
      const { diagnosisId, imageUrls, cropType, farmId, userId } = job.data;
      logger.info(`AI Worker analyzing diagnosis: ${diagnosisId} with ${imageUrls?.length || 0} images`);

      try {
        // Get farm context for better AI analysis
        const farm = await Farm.findById(farmId).lean();
        const farmContext = farm ? {
          location: farm.location?.address || farm.location?.coordinates?.latitude ? 
            `${farm.location.coordinates.latitude}, ${farm.location.coordinates.longitude}` : undefined,
          soilType: farm.soilType?.join(', '),
          irrigationType: farm.irrigationType,
          farmSize: farm.size,
          farmSizeUnit: farm.sizeUnit
        } : undefined;

        const aiResult = await analyzeCropImage(imageUrls, cropType, farmContext);

        // Build update object with all new fields
        const updateData: any = {
          diagnosis: aiResult.diagnosis,
          confidence: aiResult.confidence,
          symptoms: aiResult.symptoms,
          treatment: aiResult.treatment,
          treatmentPlan: aiResult.treatmentPlan,
          prevention: aiResult.prevention,
          severity: aiResult.severity,
          status: "detected",
          aiModel: getModelName(),
          // New enhanced fields
          imageQuality: aiResult.imageQuality,
          imageQualityIssues: aiResult.imageQualityIssues,
          affectedArea: aiResult.affectedArea,
          spreadRisk: aiResult.spreadRisk,
          spreadRiskReason: aiResult.spreadRiskReason,
          urgency: aiResult.urgency,
          totalEstimatedCost: aiResult.totalEstimatedCost,
          yieldImpact: aiResult.yieldImpact,
          weatherConsiderations: aiResult.weatherConsiderations,
          similarCases: aiResult.similarCases,
          localRemedies: aiResult.localRemedies,
          lowConfidenceWarning: aiResult.lowConfidenceWarning,
          criticalWarning: aiResult.criticalWarning,
        };

        const diagnosis = await CropDiagnosis.findByIdAndUpdate(
          diagnosisId,
          updateData,
          { new: true }
        );

        if (!diagnosis) throw new Error("Diagnosis record not found during update");

        // Build a more informative initial chat message
        let initialMessage = `🔬 **Analysis Complete for your ${cropType}**\n\n`;
        initialMessage += `**Diagnosis:** ${aiResult.diagnosis}\n`;
        initialMessage += `**Confidence:** ${aiResult.confidence}%\n`;
        initialMessage += `**Severity:** ${aiResult.severity.toUpperCase()}\n`;
        
        if (aiResult.urgency) {
          const urgencyText = {
            immediate: '🚨 Requires IMMEDIATE action',
            within_24h: '⚠️ Act within 24 hours',
            within_week: '📋 Address this week',
            monitoring: '👁️ Monitor closely'
          };
          initialMessage += `**Urgency:** ${urgencyText[aiResult.urgency as keyof typeof urgencyText] || aiResult.urgency}\n`;
        }
        
        if (aiResult.totalEstimatedCost) {
          initialMessage += `\n💰 **Est. Treatment Cost:** ${aiResult.totalEstimatedCost.currency} ${aiResult.totalEstimatedCost.min?.toLocaleString()}-${aiResult.totalEstimatedCost.max?.toLocaleString()}\n`;
        }

        if (aiResult.lowConfidenceWarning) {
          initialMessage += `\n${aiResult.lowConfidenceWarning}\n`;
        }

        if (aiResult.criticalWarning) {
          initialMessage += `\n${aiResult.criticalWarning}\n`;
        }

        initialMessage += `\nFeel free to ask me any questions about treatment options, costs, or prevention strategies!`;

        await DiagnosisChat.create({
          diagnosisId: diagnosis._id,
          userId,
          messages: [
            {
              role: "assistant",
              content: initialMessage,
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
