import CarbonCalculation from "../Models/CarbonCalculations";
import PracticeActivityLog from "../Models/PracticeActivityLogs";
import CarbonFactor from "../Models/CarbonFactor";
import Crop from "../Models/Crop";
import Farm from "../Models/Farm";
import FarmPractice from "../Models/FarmPractice";
import logger from "../Utils/logger";

export const calculateCarbonForActivity = async (activityLogId: string) => {
  try {
    const log = await PracticeActivityLog.findById(activityLogId);
    if (!log) throw new Error("Activity log not found");

    const farm = await Farm.findById(log.farmId);
    if (!farm) throw new Error("Farm not found");

    const crop = await Crop.findById(log.cropId);
    if (!crop) throw new Error("Crop not found");

    const practice = await FarmPractice.findById(log.practiceId);
    if (!practice) throw new Error("Practice not found");

    // 1. Additionality Check
    if (farm.baselinePractices.includes(practice.name)) {
      logger.info(`Additionality check failed: ${practice.name} is a baseline practice for farm ${farm._id}. No carbon credits generated.`);
      return null;
    }

    // 2. Find Carbon Factor
    // We look for a factor matching the practice, crop, soil type, and climate zone
    const factor = await CarbonFactor.findOne({
      practiceId: log.practiceId,
      cropId: log.cropId,
      soilType: farm.soilType,
      climateZone: farm.climateZone || "tropical",
    });

    if (!factor) {
      logger.warn(`No Carbon Factor found for Practice: ${practice.name}, Crop: ${crop.name}, Soil: ${farm.soilType}`);
      // Fallback: Use a generic factor for the practice if specific one isn't found
      // For now, let's just return null or throw an error to be safe
      return null;
    }

    // 3. Calculate Duration in Years
    const startDate = new Date(log.startDate);
    const endDate = new Date(log.endDate);
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const durationYears = diffDays / 365;

    // 4. Formula: Carbon = Area × CarbonFactor × CropMultiplier × Duration
    const carbonSequestered = log.size * factor.carbonFactorPerHectarePerYear * crop.carbonMultiplier * durationYears;

    // 5. Store Calculation
    const calculation = await CarbonCalculation.create({
      farmId: farm._id,
      practiceLogId: log._id,
      CarbonSequestered: carbonSequestered,
      CalculationDate: new Date(),
      periodStart: log.startDate,
      periodEnd: log.endDate,
    });

    logger.info(`Carbon sequestered calculation completed: ${carbonSequestered} tons for activity ${log._id}`);
    return calculation;
  } catch (error: any) {
    logger.error("Carbon calculation error:", error);
    throw error;
  }
};
