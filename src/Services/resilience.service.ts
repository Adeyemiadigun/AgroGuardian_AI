import Farm from "../Models/Farm";
import CropDiagnosis from "../Models/CropDiagnosis";
import ClimateRisk from "../Models/ClimateRisk";
import Crop from "../Models/Crop";
import Consultation from "../Models/Consultation";
import ResilienceProfile from "../Models/ResilienceProfile";
import PracticeActivityLog from "../Models/PracticeActivityLogs";
import logger from "../Utils/logger";

const HECTARE_TO_ACRE = 2.47105;

const convertArea = (area: number, fromUnit: "acres" | "hectares", toUnit: "acres" | "hectares") => {
  if (!Number.isFinite(area)) return 0;
  if (fromUnit === toUnit) return area;
  if (fromUnit === "hectares" && toUnit === "acres") return area * HECTARE_TO_ACRE;
  if (fromUnit === "acres" && toUnit === "hectares") return area / HECTARE_TO_ACRE;
  return area;
};

const clampScore = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export const updateResilienceProfile = async (farmId: string, userId: string) => {
  try {
    const farm = await Farm.findOne({ _id: farmId, owner: userId });
    if (!farm) {
      logger.error(`Farm not found for resilience profile update: Farm ID ${farmId} for user ${userId}`);
      throw new Error("Farm not found");
    }

    const diagnoses = await CropDiagnosis.find({ farmId: farmId, userId: userId });
    const consultations = await Consultation.find({ farmId: farmId, userId: userId });
    const climateRisks = await ClimateRisk.find({ farmId: farmId }).sort({ timestamp: -1 }).limit(10);
    const crops = await Crop.find({ farmId });

    // Diagnosis management score
    const totalDiagnoses = diagnoses.length;
    const resolvedDiagnoses = diagnoses.filter((d) => d.status === "resolved").length;
    const diagnosisScore = totalDiagnoses === 0 ? 50 : Math.round((resolvedDiagnoses / totalDiagnoses) * 100);

    // Consultation management score
    const totalConsultations = consultations.length;
    const resolvedConsultations = consultations.filter((c) => c.status === "resolved").length;
    const activeHighSeverity = consultations.filter(
      (c) => c.status === "active" && (c.severity === "high" || c.severity === "critical")
    ).length;
    
    // Consultation score: resolved consultations good, active high-severity bad
    let consultationScore = 50;
    if (totalConsultations > 0) {
      const resolvedRatio = resolvedConsultations / totalConsultations;
      const severityPenalty = activeHighSeverity * 15; // -15 points per active high/critical issue
      consultationScore = Math.max(0, Math.round(resolvedRatio * 100) - severityPenalty);
    }

    // Combined management score (60% diagnosis, 40% consultation)
    const managementScore = Math.round(diagnosisScore * 0.6 + consultationScore * 0.4);

    const highRiskEvents = climateRisks.filter(
      (r) => r.droughtRisk === "high" || r.floodRisk === "high" || r.heatRisk === "high"
    ).length;
    const climateScore = Math.max(0, 100 - highRiskEvents * 10);

    const cropCount = crops.length;
    let diversityScore = 0;
    if (cropCount >= 4) diversityScore = 100;
    else if (cropCount >= 2) diversityScore = 80;
    else if (cropCount === 1) diversityScore = 40;

    // Sustainability Index (0-100)
    // Based on: adoption of practices, coverage across practice categories, area coverage vs farm size, and completion rate.
    const now = new Date();
    const windowStart = new Date(now);
    windowStart.setUTCFullYear(windowStart.getUTCFullYear() - 1);

    const practiceLogs = await PracticeActivityLog.find({
      farmId,
      appliedBy: userId,
      startDate: { $gte: windowStart, $lte: now },
    })
      .populate("practiceId", "category name")
      .select("practiceId size sizeUnit status startDate");

    const distinctPractices = new Set(
      practiceLogs.map((l: any) => String(l.practiceId?._id || l.practiceId)).filter(Boolean)
    );

    // Target: 6 distinct sustainable practices/year => 100%
    const adoptionScore = clampScore((distinctPractices.size / 6) * 100);

    const categories = new Set(
      practiceLogs
        .map((l: any) => String(l.practiceId?.category || "").trim())
        .filter(Boolean)
    );
    const categoryCoverageScore = clampScore((Math.min(4, categories.size) / 4) * 100);

    const farmUnit = (farm as any).sizeUnit as "acres" | "hectares";
    const farmSize = Number((farm as any).size || 0) || 0;
    const totalPracticeArea = practiceLogs.reduce((sum: number, l: any) => {
      const area = Number(l.size || 0);
      const unit = (l.sizeUnit || farmUnit) as "acres" | "hectares";
      return sum + convertArea(area, unit, farmUnit);
    }, 0);

    const areaCoverageScore = farmSize > 0 ? clampScore((Math.min(farmSize, totalPracticeArea) / farmSize) * 100) : 0;

    const completedCount = practiceLogs.filter((l: any) => l.status === "completed").length;
    const completionScore = practiceLogs.length > 0 ? clampScore((completedCount / practiceLogs.length) * 100) : 0;

    const sustainabilityScore = clampScore(
      adoptionScore * 0.35 + categoryCoverageScore * 0.2 + areaCoverageScore * 0.25 + completionScore * 0.2
    );

    const overallScore = Math.round(
      managementScore * 0.4 + climateScore * 0.3 + diversityScore * 0.3
    );

    const recommendations: string[] = [];
    if (diagnosisScore < 70) {
      recommendations.push("Improve your score by resolving active crop disease diagnoses promptly.");
    }
    if (activeHighSeverity > 0) {
      recommendations.push(`You have ${activeHighSeverity} active high-severity consultation(s). Address these issues to improve your resilience score.`);
    }
    if (consultationScore < 50 && totalConsultations > 0) {
      recommendations.push("Mark resolved consultations as 'Resolved' to reflect your proactive farm management.");
    }
    if (diversityScore < 60) {
      recommendations.push("Consider increasing crop diversity (e.g., intercropping or rotation) to reduce financial risk.");
    }
    if (highRiskEvents > 2) {
      recommendations.push("Frequent high climate risks detected. Review your optimal planting windows to ensure resilience.");
    }

    // Sustainability recommendations
    if (sustainabilityScore < 60) {
      if (adoptionScore < 60) {
        recommendations.push("Increase your sustainability score by logging more climate-smart farm practices consistently.");
      }
      if (categoryCoverageScore < 75) {
        const all = ["soil", "crop", "water", "agroforestry"];
        const missing = all.filter((c) => !categories.has(c));
        if (missing.length) {
          recommendations.push(`Add practices in these categories to improve sustainability coverage: ${missing.join(", ")}.`);
        }
      }
      if (areaCoverageScore < 50) {
        recommendations.push("Expand the land area where you apply sustainable practices to improve sustainability coverage.");
      }
      if (completionScore < 60 && practiceLogs.length > 0) {
        recommendations.push("Complete and verify more practice logs (upload evidence when eligible) to strengthen your sustainability index.");
      }
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

    logger.info(
      `Resilience Profile updated for farm ${farmId}. New Score: ${overallScore} (Management: ${managementScore}, Climate: ${climateScore}, Diversity: ${diversityScore}, Sustainability: ${sustainabilityScore})`
    );
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
