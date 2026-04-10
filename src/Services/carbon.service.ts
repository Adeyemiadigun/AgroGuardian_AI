import CarbonCalculation from "../Models/CarbonCalculations";
import PracticeActivityLog from "../Models/PracticeActivityLogs";
import CarbonFactor from "../Models/CarbonFactor";
import Crop from "../Models/Crop";
import Farm from "../Models/Farm";
import FarmPractice from "../Models/FarmPractice";
import logger from "../Utils/logger";

/**
 * Carbon Calculation Engine
 * Formula: Carbon = Area × CarbonFactor × CropMultiplier × Duration
 */
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
      logger.info(`Additionality check failed: ${practice.name} is a baseline practice for farm ${farm._id}.`);
      return null;
    }

    // 2. Dynamic Factor Lookup
    // We now use soilType from the LOG (picked by user) and required cropId
    // Auto-determine climate zone from latitude if not set
    if (!farm.climateZone) {
      const lat = farm.location?.coordinates?.latitude;
      if (lat !== undefined) {
        const absLat = Math.abs(lat);
        let zone: "tropical" | "arid" | "temperate" | "continental" | "polar" = "tropical";
        if (absLat <= 23.5) zone = "tropical";
        else if (absLat <= 35) zone = "arid";
        else if (absLat <= 50) zone = "temperate";
        else if (absLat <= 66.5) zone = "continental";
        else zone = "polar";
        
        farm.climateZone = zone;
        await farm.save();
        logger.info(`Auto-set climate zone to ${zone} for farm ${farm._id} based on latitude ${lat}`);
      } else {
        // Default to tropical if no coordinates
        farm.climateZone = "tropical";
        await farm.save();
        logger.info(`Defaulted climate zone to tropical for farm ${farm._id}`);
      }
    }

    let carbonFactor = 0.8; // Default Base Rate: tons/hectare/year

    const factor = await CarbonFactor.findOne({
      practiceId: log.practiceId,
      cropId: log.cropId,
      soilType: log.soilType,
      climateZone: farm.climateZone || "tropical",
    });

    if (factor) {
      carbonFactor = factor.carbonFactorPerHectarePerYear;
    } else {
      // DYNAMIC FALLBACK: Calculate weight based on Farm Profile
      logger.info(`No specific factor found. Using dynamic farm-based calculation for log ${log._id}`);
      
      // Soil weighting
      if (log.soilType.includes("clay") || log.soilType.includes("loamy")) carbonFactor *= 1.2;
      if (log.soilType.includes("sandy")) carbonFactor *= 0.9;

      // Climate weighting
      const zone = farm.climateZone?.toLowerCase() || "tropical";
      if (zone === "tropical") carbonFactor *= 1.25;
      if (zone === "arid") carbonFactor *= 0.8;
    }

    // 3. Calculate Duration (Years)
    const startDate = new Date(log.startDate);
    const endDate = new Date(log.endDate);
    const durationMs = Math.abs(endDate.getTime() - startDate.getTime());
    const durationYears = durationMs / (1000 * 60 * 60 * 24 * 365.25);

    // 4. Formula: Carbon = Area × CarbonFactor × CropMultiplier × Duration
    // Ensure size is treated in hectares for the standard factor
    const areaInHectares = log.sizeUnit === "acres" ? log.size * 0.404686 : log.size;
    
    const carbonSequestered = areaInHectares * carbonFactor * (crop.carbonMultiplier || 1.0) * (durationYears || 0.1);

    // 5. Store Calculation
    const calculation = await CarbonCalculation.create({
      farmId: farm._id,
      practiceLogId: log._id,
      CarbonSequestered: Number(carbonSequestered.toFixed(4)),
      CalculationDate: new Date(),
      periodStart: log.startDate,
      periodEnd: log.endDate,
    });

    logger.info(`Engine: Successfully calculated ${carbonSequestered.toFixed(4)} tons CO2e for log ${log._id}`);

    // NOTE: Credits are now generated as monthly accrual entries (estimated) and later verified/issued.
    // We keep CarbonCalculations for auditing, but avoid minting duplicate credit records here.

    return calculation;
  } catch (error: any) {
    logger.error("Carbon Engine Error:", error);
    throw error;
  }
};
