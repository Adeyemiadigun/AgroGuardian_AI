import Farm from "../Models/Farm";
import CropDiagnosis from "../Models/CropDiagnosis";
import ClimateRisk from "../Models/ClimateRisk";
import Crop from "../Models/Crop";
import ResilienceProfile from "../Models/ResilienceProfile";
import logger from "../Utils/logger";

export const updateResilienceProfile = async (farmId: string, userId: string) => {
  try {
    const farm = await Farm.findOne({ _id: farmId, owner: userId });
    if (!farm) {
      logger.error(`Farm not found for resilience profile update: Farm ID ${farmId} for user ${userId}`);
      throw new Error("Farm not found");
    }

    const diagnoses = await CropDiagnosis.find({ farmId: farmId, userId: userId });
    const climateRisks = await ClimateRisk.find({ farmId: farmId }).sort({ timestamp: -1 }).limit(10);
    const crops = await Crop.find({ farmId });

    const totalDiagnoses = diagnoses.length;
    const resolvedDiagnoses = diagnoses.filter((d) => d.status === "resolved").length;
    const managementScore = totalDiagnoses === 0 ? 50 : Math.round((resolvedDiagnoses / totalDiagnoses) * 100);


    const highRiskEvents = climateRisks.filter(
      (r) => r.droughtRisk === "high" || r.floodRisk === "high" || r.heatRisk === "high"
    ).length;
    const climateScore = Math.max(0, 100 - highRiskEvents * 10);

    const cropCount = crops.length;
    let diversityScore = 0;
    if (cropCount >= 4) diversityScore = 100;
    else if (cropCount >= 2) diversityScore = 80;
    else if (cropCount === 1) diversityScore = 40;

    const sustainabilityScore = 0;

    const overallScore = Math.round(
      managementScore * 0.4 + climateScore * 0.3 + diversityScore * 0.3
    );

    const recommendations: string[] = [];
    if (managementScore < 70) {
      recommendations.push("Improve your score by resolving active crop disease diagnoses promptly.");
    }
    if (diversityScore < 60) {
      recommendations.push("Consider increasing crop diversity (e.g., intercropping or rotation) to reduce financial risk.");
    }
    if (highRiskEvents > 2) {
      recommendations.push("Frequent high climate risks detected. Review your optimal planting windows to ensure resilience.");
    }
    if (recommendations.length === 0) {
      recommendations.push("Your farm shows excellent resilience. Maintain these practices to keep your credit profile strong.");
    }

    const profile = await ResilienceProfile.findOneAndUpdate(
      { farmId: farmId as any, userId: userId as any },
      {
        $set: {
          overallScore,
          metrics: {
            managementScore,
            climateAdaptationScore: climateScore,
            diversityScore,
            sustainabilityScore,
          },
          recommendations,
        },
        $push: {
          history: {
            score: overallScore,
            timestamp: new Date(),
          },
        },
      },
      { upsert: true, new: true }
    );

    logger.info(`Resilience Profile updated for farm ${farmId}. New Score: ${overallScore}`);
    return profile;
  } catch (error: any) {
    logger.error(`Error updating resilience profile: ${error.message}`);
    throw error;
  }
};

export const getResilienceProfile = async (farmId: string, userId: string) => {
  const profile = await ResilienceProfile.findOne({ farmId: farmId as any, userId: userId as any });
  if (!profile) {
    return await updateResilienceProfile(farmId, userId);
  }
  return profile;
};
