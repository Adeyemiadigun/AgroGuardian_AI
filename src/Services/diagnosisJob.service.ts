import CropDiagnosis from '../Models/CropDiagnosis';
import DiagnosisChat from '../Models/DiagnosisChat';
import Farm from '../Models/Farm';
import User from '../Models/User';
import logger from '../Utils/logger';
import { analyzeCropImage, getModelName } from '../Utils/geminiClient';
import { addResilienceSyncJob } from '../Queues/resilience.queue';
import { sendBrevoEmail } from './email.service';

export type CropDiagnosisJobData = {
  diagnosisId: string;
  imageUrls: string[];
  cropType: string;
  farmId: string;
  userId: string;
};

export const processCropDiagnosisJob = async (data: CropDiagnosisJobData) => {
  const { diagnosisId, imageUrls, cropType, farmId, userId } = data;

  logger.info(`AI processing crop diagnosis inline/job: ${diagnosisId} with ${imageUrls?.length || 0} images`);

  try {
    const farm = await Farm.findById(farmId).lean();
    const farmContext = farm
      ? {
          location:
            (farm as any).location?.address || (farm as any).location?.coordinates?.latitude
              ? `${(farm as any).location.coordinates.latitude}, ${(farm as any).location.coordinates.longitude}`
              : undefined,
          soilType: (farm as any).soilType?.join(', '),
          irrigationType: (farm as any).irrigationType,
          farmSize: (farm as any).size,
          farmSizeUnit: (farm as any).sizeUnit,
        }
      : undefined;

    const aiResult = await analyzeCropImage(imageUrls, cropType) as any; // farmContext removed

    const updateData: any = {
      diagnosis: aiResult.diagnosis,
      confidence: aiResult.confidence,
      symptoms: aiResult.symptoms,
      treatment: aiResult.treatment,
      treatmentPlan: aiResult.treatmentPlan,
      prevention: aiResult.prevention,
      severity: aiResult.severity,
      status: 'detected',
      aiModel: getModelName(),
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

    const diagnosis = await CropDiagnosis.findByIdAndUpdate(diagnosisId, updateData, { new: true });
    if (!diagnosis) throw new Error('Diagnosis record not found during update');

    // Create initial chat message (same idea as worker, compact)
    let initialMessage = `🔬 **Analysis Complete for your ${cropType}**\n\n`;
    initialMessage += `**Diagnosis:** ${aiResult.diagnosis}\n`;
    initialMessage += `**Confidence:** ${aiResult.confidence}%\n`;
    initialMessage += `**Severity:** ${String(aiResult.severity || 'low').toUpperCase()}\n`;

    if (aiResult.urgency) {
      const urgencyText: Record<string, string> = {
        immediate: '🚨 Requires IMMEDIATE action',
        within_24h: '⚠️ Act within 24 hours',
        within_week: '📋 Address this week',
        monitoring: '👁️ Monitor closely',
      };
      initialMessage += `**Urgency:** ${urgencyText[String(aiResult.urgency)] || aiResult.urgency}\n`;
    }

    if (aiResult.totalEstimatedCost) {
      initialMessage += `\n💰 **Est. Treatment Cost:** ${aiResult.totalEstimatedCost.currency} ${aiResult.totalEstimatedCost.min?.toLocaleString?.() || aiResult.totalEstimatedCost.min}-${aiResult.totalEstimatedCost.max?.toLocaleString?.() || aiResult.totalEstimatedCost.max}\n`;
    }

    if (aiResult.lowConfidenceWarning) initialMessage += `\n${aiResult.lowConfidenceWarning}\n`;
    if (aiResult.criticalWarning) initialMessage += `\n${aiResult.criticalWarning}\n`;

    initialMessage += `\nAsk me any questions about treatment, costs, or prevention.`;

    await DiagnosisChat.create({
      diagnosisId: diagnosis._id,
      userId,
      messages: [{ role: 'assistant', content: initialMessage, timestamp: new Date() }],
    });

    // Send email for critical cases
    if (aiResult.severity === 'critical' || aiResult.urgency === 'immediate') {
      const user = await User.findById(userId);
      if (user) {
        await sendBrevoEmail(
          user.email,
          '🚨 Urgent: Critical Crop Health Alert',
          `<h2>Critical Crop Health Alert</h2>
          <p>Your ${cropType} requires immediate attention.</p>
          <p><strong>Diagnosis:</strong> ${aiResult.diagnosis}</p>
          <p><strong>Severity:</strong> ${aiResult.severity}</p>
          <p><strong>Urgency:</strong> ${aiResult.urgency}</p>
          <a href="${process.env.FRONTEND_URL}/diagnosis?farmId=${farmId}">View Full Diagnosis</a>`
        );
      }
    }

    // Non-critical: try to sync resilience, but don't fail the diagnosis if it can't queue.
    try {
      await addResilienceSyncJob(farmId, userId);
    } catch (e: any) {
      logger.warn(`Resilience sync skipped/failed for farm ${farmId}: ${e?.message || e}`);
    }

    logger.info(`AI crop diagnosis complete for: ${diagnosisId}`);
    return diagnosis;
  } catch (error: any) {
    logger.error(`AI crop diagnosis failed for ${diagnosisId}: ${error.message}`);

    // Mark record failed so UI doesn't hang.
    try {
      await CropDiagnosis.findByIdAndUpdate(diagnosisId, {
        status: 'failed',
        diagnosis: 'Analysis failed. Please retry later.',
        aiModel: getModelName(),
      });
    } catch (e: any) {
      logger.warn(`Failed updating diagnosis ${diagnosisId} to failed: ${e?.message || e}`);
    }

    throw error;
  }
};
