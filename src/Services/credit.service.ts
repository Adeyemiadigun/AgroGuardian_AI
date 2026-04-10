import CarbonCredits from "../Models/CarbonCredits";
import Farm from "../Models/Farm";
import logger from "../Utils/logger";
import mongoose from "mongoose";

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

    if (!periodStart || !periodEnd || isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime())) {
      throw new Error("Invalid periodStart/periodEnd");
    }
    if (periodStart.getTime() > periodEnd.getTime()) {
      throw new Error("periodStart must be before periodEnd");
    }

    // Credits are auto-created per successfully verified practice activity (see carbon.service.ts + verification.service.ts).
    // So this endpoint should NOT mint duplicates. Instead, it "issues" already-verified credits for the selected period.
    const match = {
      farmId,
      periodStart: { $gte: periodStart },
      periodEnd: { $lte: periodEnd },
    };

    const alreadyIssuedCount = await CarbonCredits.countDocuments({
      ...match,
      status: "issued",
    });

    const issueNow = new Date();

    const issueResult = await CarbonCredits.updateMany(
      {
        ...match,
        status: "verified",
      },
      {
        $set: { status: "issued", issuedDate: issueNow, updatedAt: issueNow },
      }
    );

    const issuedCredits = await CarbonCredits.find({
      ...match,
      status: "issued",
    });

    const issuedTotal = issuedCredits.reduce((sum, c: any) => sum + Number(c.creditsEarned || 0), 0);

    if ((issueResult.modifiedCount || 0) === 0 && alreadyIssuedCount === 0) {
      throw new Error("No verified credits found for this period (complete and verify practice logs first)");
    }

    logger.info(`Issued credits for farm ${farmId} (Period: ${periodStart.toISOString()} - ${periodEnd.toISOString()})`, {
      farmId,
      modified: issueResult.modifiedCount,
      matched: issueResult.matchedCount,
      alreadyIssuedCount,
      issuedTotal,
    });

    return {
      alreadyIssuedCount,
      newlyIssuedCount: issueResult.modifiedCount || 0,
      issuedTotal,
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

/**
 * Get monthly aggregated carbon credit summary for a specific farmer
 */
export const getFarmerMonthlySummary = async (userId: string, status?: string) => {
  const farms = await Farm.find({ owner: userId }, "_id");
  const farmIds = farms.map(f => f._id);

  const match: any = { farmId: { $in: farmIds } };
  if (status) {
    match.status = status;
  }

  return await CarbonCredits.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          month: { $month: "$issuedDate" },
          year: { $year: "$issuedDate" }
        },
        totalCredits: { $sum: "$creditsEarned" },
        count: { $sum: 1 },
        statusBreakdown: {
          $push: "$status"
        }
      }
    },
    { $sort: { "_id.year": -1, "_id.month": -1 } }
  ]);
};

/**
 * Get monthly aggregated carbon credit summary for a specific farm
 */
export const getFarmMonthlySummary = async (farmId: string, userId: string, status?: string) => {
  const farm = await Farm.findOne({ _id: farmId, owner: userId });
  if (!farm) {
    throw new Error("Farm not found or you don't have permission");
  }

  const match: any = { farmId: new mongoose.Types.ObjectId(farmId) };
  if (status) {
    match.status = status;
  }

  return await CarbonCredits.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          month: { $month: "$issuedDate" },
          year: { $year: "$issuedDate" }
        },
        totalCredits: { $sum: "$creditsEarned" },
        count: { $sum: 1 }
      }
    },
    { $sort: { "_id.year": -1, "_id.month": -1 } }
  ]);
};
