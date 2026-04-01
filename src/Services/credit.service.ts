import CarbonCredits from "../Models/CarbonCredits";
import CarbonCalculation from "../Models/CarbonCalculations";
import Farm from "../Models/Farm";
import logger from "../Utils/logger";

export const generateCreditsForFarm = async (
  farmId: string,
  userId: string,
  periodStart: Date,
  periodEnd: Date
) => {
  try {
    const farm = await Farm.findOne({ _id: farmId, owner: userId });
    if (!farm) {
      throw new Error("Farm not found or you don't have permission");
    }

    // 1. Aggregate calculations in period
    const calculations = await CarbonCalculation.find({
      farmId,
      periodStart: { $gte: periodStart },
      periodEnd: { $lte: periodEnd },
    });

    if (calculations.length === 0) {
      throw new Error("No carbon calculations found for this period");
    }

    const totalSequestered = calculations.reduce(
      (sum, calc) => sum + calc.CarbonSequestered,
      0
    );

    // 2. Apply Buffer Pool (20% holdback for risk)
    const bufferMultiplier = 0.8; 
    const creditsToIssue = totalSequestered * bufferMultiplier;

    // 3. Create Carbon Credit record
    const credit = await CarbonCredits.create({
      farmId,
      creditsEarned: creditsToIssue,
      status: "pending-verification",
      issuedDate: new Date(),
      periodStart,
      periodEnd,
    });

    logger.info(`Generated ${creditsToIssue} credits for farm ${farmId} (Period: ${periodStart.toLocaleDateString()} - ${periodEnd.toLocaleDateString()})`);
    
    return {
      totalSequestered,
      creditsToIssue,
      bufferHeld: totalSequestered - creditsToIssue,
      creditRecord: credit,
    };
  } catch (error: any) {
    logger.error("Credit generation error:", error);
    throw error;
  }
};

export const getFarmCredits = async (farmId: string, userId: string) => {
  const farm = await Farm.findOne({ _id: farmId, owner: userId });
  if (!farm) {
    throw new Error("Farm not found or you don't have permission");
  }

  return await CarbonCredits.find({ farmId }).sort({ issuedDate: -1 });
};

export const getAllUserCredits = async (userId: string) => {
    // 1. Get all farms belonging to the user
    const farms = await Farm.find({ owner: userId }, "_id");
    const farmIds = farms.map(f => f._id);

    // 2. Get credits for those farms
    return await CarbonCredits.find({ farmId: { $in: farmIds } })
        .populate("farmId", "name location")
        .sort({ issuedDate: -1 });
};
