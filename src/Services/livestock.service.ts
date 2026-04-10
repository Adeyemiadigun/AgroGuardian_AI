import Livestock from "../Models/Livestock";
import { LivestockHealth } from "../Models/LivestockHealth";
import { LivestockInventory } from "../Models/LivestockManagement";
import Farm from "../Models/Farm";
import cloudinary from "../Config/cloudinary";
import logger from "../Utils/logger";
import mongoose from "mongoose";
import { livestockHealthCheckService } from './livestock-health-check.service';
import { addLivestockHealthCheckJob } from '../Queues/livestockHealthCheck.queue';

// Get all livestock for a farm
export const getLivestockByFarm = async (farmId: string, userId: string, filters?: {
  species?: string;
  status?: string;
  trackingType?: string;
}) => {
  const farm = await Farm.findOne({ _id: farmId, owner: userId });
  if (!farm) {
    throw new Error("Farm not found or you don't have permission");
  }

  const query: any = { farmId, owner: userId };
  
  if (filters?.species) query.species = filters.species;
  if (filters?.status) query.status = filters.status;
  if (filters?.trackingType) query.trackingType = filters.trackingType;

  const livestock = await Livestock.find(query)
    .sort({ createdAt: -1 })
    .populate("sireId", "name tagId species")
    .populate("damId", "name tagId species");

  return livestock;
};

// Get single livestock by ID
export const getLivestockById = async (livestockId: string, userId: string) => {
  const livestock = await Livestock.findOne({ _id: livestockId, owner: userId })
    .populate("sireId", "name tagId species breed")
    .populate("damId", "name tagId species breed")
    .populate("offspring", "name tagId species gender dateOfBirth");

  if (!livestock) {
    throw new Error("Livestock not found or you don't have permission");
  }

  // Get recent health records
  const healthRecords = await LivestockHealth.find({ livestockId })
    .sort({ recordDate: -1 })
    .limit(10);

  return { livestock, healthRecords };
};

// Create new livestock
export const createLivestock = async (
  data: any,
  userId: string,
  imageBuffer?: Buffer
) => {
  const farm = await Farm.findOne({ _id: data.farmId, owner: userId });
  if (!farm) {
    throw new Error("Farm not found or you don't have permission");
  }

  // Upload image if provided
  let imageUrl: string | undefined;
  if (imageBuffer) {
    const uploadResult = await new Promise<{ secure_url: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: "agroguardian/livestock", resource_type: "image" },
        (error, result) => {
          if (error || !result) return reject(error || new Error("Upload failed"));
          resolve(result);
        }
      );
      stream.end(imageBuffer);
    });
    imageUrl = uploadResult.secure_url;
  }

  // Generate batch ID for batch tracking
  let batchId = data.batchId;
  if (data.trackingType === "batch" && !batchId) {
    const timestamp = Date.now().toString(36).toUpperCase();
    batchId = `${data.species.toUpperCase().slice(0, 3)}-${timestamp}`;
  }

  const livestock = await Livestock.create({
    ...data,
    owner: userId,
    batchId,
    imageUrls: imageUrl ? [imageUrl] : [],
    acquisitionDate: data.acquisitionDate ? new Date(data.acquisitionDate) : new Date(),
    dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined
  });

  // Create inventory record for purchase/birth
  if (data.acquisitionMethod === "purchase" || data.acquisitionMethod === "birth") {
    const qty = data.trackingType === 'batch' ? Number(data.quantity || 0) : 1;
    const safeQty = Number.isFinite(qty) && qty > 0 ? qty : 1;

    // For batch livestock, acquisitionCost is treated as TOTAL paid for the whole batch.
    // We store unitPrice for convenience (per-animal) and totalAmount as the total paid.
    const totalAmount =
      data.acquisitionMethod === "birth" ? 0 : (data.acquisitionCost ?? undefined);

    const unitPrice =
      data.acquisitionMethod === "birth"
        ? 0
        : (totalAmount != null ? Number(totalAmount) / safeQty : undefined);

    await LivestockInventory.create({
      farmId: data.farmId,
      owner: userId,
      livestockId: livestock._id,
      transactionType: data.acquisitionMethod,
      species: data.species,
      quantity: data.quantity || 1,
      unitPrice,
      totalAmount,
      transactionDate: data.acquisitionDate ? new Date(data.acquisitionDate) : new Date(),
      notes: `Initial ${data.acquisitionMethod} record`
    });
  }

  logger.info(`Livestock created: ${livestock._id}`, { 
    species: data.species, 
    trackingType: data.trackingType,
    userId 
  });

  // Create an initial rule-based health-check report immediately, then queue AI enhancement.
  try {
    await livestockHealthCheckService.recompute(livestock._id.toString(), { reason: 'livestock_created', useAI: false });
    await addLivestockHealthCheckJob({ livestockId: livestock._id.toString(), reason: 'livestock_created' });
  } catch (e: any) {
    logger.warn(`HealthCheck recompute failed on create: ${e?.message || e}`);
  }

  return livestock;
};

// Update livestock
export const updateLivestock = async (
  livestockId: string,
  userId: string,
  updates: any,
  imageBuffer?: Buffer
) => {
  const livestock = await Livestock.findOne({ _id: livestockId, owner: userId });
  if (!livestock) {
    throw new Error("Livestock not found or you don't have permission");
  }

  // Upload new image if provided
  if (imageBuffer) {
    const uploadResult = await new Promise<{ secure_url: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: "agroguardian/livestock", resource_type: "image" },
        (error, result) => {
          if (error || !result) return reject(error || new Error("Upload failed"));
          resolve(result);
        }
      );
      stream.end(imageBuffer);
    });
    
    // Add to existing images
    updates.imageUrls = [...(livestock.imageUrls || []), uploadResult.secure_url];
  }

  // Parse dates if provided
  if (updates.dateOfBirth) {
    updates.dateOfBirth = new Date(updates.dateOfBirth);
  }

  const updatedLivestock = await Livestock.findByIdAndUpdate(
    livestockId,
    { $set: updates },
    { new: true }
  );

  logger.info(`Livestock updated: ${livestockId}`, { userId });

  // Update health-check report (rule-based now, AI enhancement queued)
  try {
    await livestockHealthCheckService.recompute(livestockId, { reason: 'livestock_updated', useAI: false });
    await addLivestockHealthCheckJob({ livestockId, reason: 'livestock_updated' });
  } catch (e: any) {
    logger.warn(`HealthCheck recompute failed on update: ${e?.message || e}`);
  }

  return updatedLivestock;
};

// Add weight record
export const addWeightRecord = async (
  livestockId: string,
  userId: string,
  weightData: { weight: number; unit?: string; notes?: string }
) => {
  const livestock = await Livestock.findOne({ _id: livestockId, owner: userId });
  if (!livestock) {
    throw new Error("Livestock not found or you don't have permission");
  }

  const weightRecord = {
    weight: weightData.weight,
    unit: weightData.unit || "kg",
    recordedAt: new Date(),
    notes: weightData.notes
  };

  const updated = await Livestock.findByIdAndUpdate(
    livestockId,
    {
      $set: { weight: weightData.weight },
      $push: { weightHistory: weightRecord }
    },
    { new: true }
  );

  logger.info(`Weight recorded for livestock: ${livestockId}`, { 
    weight: weightData.weight, 
    userId 
  });

  // Update health-check report (growth-related)
  try {
    await livestockHealthCheckService.recompute(livestockId, { reason: 'weight_recorded', useAI: false });
    await addLivestockHealthCheckJob({ livestockId, reason: 'weight_recorded' });
  } catch (e: any) {
    logger.warn(`HealthCheck recompute failed on weight record: ${e?.message || e}`);
  }

  return updated;
};

// Delete livestock
export const deleteLivestock = async (livestockId: string, userId: string) => {
  const livestock = await Livestock.findOne({ _id: livestockId, owner: userId });
  if (!livestock) {
    throw new Error("Livestock not found or you don't have permission");
  }

  // Soft delete by changing status to deceased or use hard delete
  // For now, we'll do a hard delete but you might want soft delete
  await Livestock.findByIdAndDelete(livestockId);
  
  // Also delete related health records
  await LivestockHealth.deleteMany({ livestockId });

  logger.info(`Livestock deleted: ${livestockId}`, { userId });

  return { message: "Livestock deleted successfully" };
};

// Get livestock statistics for a farm
export const getLivestockStats = async (farmId: string, userId: string) => {
  const farm = await Farm.findOne({ _id: farmId, owner: userId });
  if (!farm) {
    throw new Error("Farm not found or you don't have permission");
  }

  const farmObjectId = new mongoose.Types.ObjectId(farmId);

  // Aggregate statistics
  const stats = await Livestock.aggregate([
    { $match: { farmId: farmObjectId, owner: new mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: "$species",
        totalCount: {
          $sum: {
            $cond: [
              { $eq: ["$trackingType", "batch"] },
              "$quantity",
              1
            ]
          }
        },
        activeCount: {
          $sum: {
            $cond: [
              { $in: ["$status", ["active", "breeding"]] },
              { $cond: [{ $eq: ["$trackingType", "batch"] }, "$quantity", 1] },
              0
            ]
          }
        },
        sickCount: {
          $sum: {
            $cond: [
              { $in: ["$healthStatus", ["sick", "under_treatment", "critical"]] },
              { $cond: [{ $eq: ["$trackingType", "batch"] }, "$quantity", 1] },
              0
            ]
          }
        },
        records: { $sum: 1 }
      }
    }
  ]);

  // Get health alerts (upcoming vaccinations)
  const upcomingVaccinations = await LivestockHealth.find({
    farmId: farmObjectId,
    owner: new mongoose.Types.ObjectId(userId),
    recordType: "vaccination",
    nextDueDate: {
      $gte: new Date(),
      $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Next 7 days
    }
  })
    .populate("livestockId", "name tagId species")
    .limit(10);

  // Total value (from acquisition costs)
  // Note: For batch livestock, `cost` / `acquisitionCost` are treated as TOTAL values for the batch.
  const totalValue = await Livestock.aggregate([
    { $match: { farmId: farmObjectId, owner: new mongoose.Types.ObjectId(userId), status: { $in: ["active", "breeding"] } } },

    {
      $group: {
        _id: null,
        totalValue: {
          $sum: {
            $ifNull: ["$cost", { $ifNull: ["$acquisitionCost", 0] }]
          }
        }
      }
    }
  ]);

  // Weighing frequency (how often animals/groups are weighed)
  const now = new Date();
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const windowDays = 30;
  const windowStart = new Date(now.getTime() - windowDays * MS_PER_DAY);
  const intervalWindowDays = 90;
  const intervalWindowStart = new Date(now.getTime() - intervalWindowDays * MS_PER_DAY);

  const livestockForWeighing = await Livestock.find({
    farmId: farmObjectId,
    owner: new mongoose.Types.ObjectId(userId),
    status: { $in: ['active', 'breeding'] }
  })
    .select('trackingType quantity weightHistory.recordedAt')
    .lean();

  const effectiveCount = (l: any) => (l?.trackingType === 'batch' ? Number(l?.quantity || 0) : 1);

  const totalActiveAnimals = livestockForWeighing.reduce((sum: number, l: any) => sum + effectiveCount(l), 0);

  let weighInsLast30Days = 0;
  let animalsWeighedLast30Days = 0;
  let lastWeighInAt: Date | null = null;

  const intervalDays: number[] = [];

  for (const l of livestockForWeighing) {
    const dates: Date[] = (l.weightHistory || [])
      .map((w: any) => (w?.recordedAt ? new Date(w.recordedAt) : null))
      .filter((d: Date | null): d is Date => !!d && !Number.isNaN(d.getTime()))
      .sort((a: Date, b: Date) => a.getTime() - b.getTime());

    if (dates.length) {
      const last = dates[dates.length - 1];
      if (!lastWeighInAt || last.getTime() > lastWeighInAt.getTime()) lastWeighInAt = last;
    }

    const inLast30 = dates.filter((d: Date) => d.getTime() >= windowStart.getTime());
    weighInsLast30Days += inLast30.length;
    if (inLast30.length > 0) {
      animalsWeighedLast30Days += effectiveCount(l);
    }

    const recentForIntervals = dates.filter((d: Date) => d.getTime() >= intervalWindowStart.getTime()).slice(-10);
    for (let i = 1; i < recentForIntervals.length; i++) {
      intervalDays.push((recentForIntervals[i].getTime() - recentForIntervals[i - 1].getTime()) / MS_PER_DAY);
    }
  }

  const avgDaysBetweenWeighIns = intervalDays.length
    ? intervalDays.reduce((sum, v) => sum + v, 0) / intervalDays.length
    : null;

  const daysSinceLastWeighIn = lastWeighInAt
    ? Math.floor((now.getTime() - lastWeighInAt.getTime()) / MS_PER_DAY)
    : null;

  const avgWeighInsPerAnimalLast30Days = totalActiveAnimals > 0
    ? weighInsLast30Days / totalActiveAnimals
    : 0;

  return {
    bySpecies: stats,
    totalAnimals: stats.reduce((sum, s) => sum + s.totalCount, 0),
    totalSick: stats.reduce((sum, s) => sum + s.sickCount, 0),
    upcomingVaccinations,
    estimatedValue: totalValue[0]?.totalValue || 0,
    weighing: {
      windowDays,
      totalActiveAnimals,
      weighInsLast30Days,
      animalsWeighedLast30Days,
      avgWeighInsPerAnimalLast30Days,
      avgDaysBetweenWeighIns,
      daysSinceLastWeighIn,
      lastWeighInAt
    }
  };
};

// Get all livestock across all farms for a user
export const getAllUserLivestock = async (userId: string) => {
  const livestock = await Livestock.find({ owner: userId })
    .populate("farmId", "name location")
    .sort({ createdAt: -1 });

  return livestock;
};

// Dashboard summary across all farms for a user
export const getLivestockDashboardSummary = async (userId: string) => {
  const ownerId = new mongoose.Types.ObjectId(userId);

  const baseMatch = { owner: ownerId, status: { $in: ['active', 'breeding'] } };

  const [overall] = await Livestock.aggregate([
    { $match: baseMatch },
    {
      $addFields: {
        effectiveCount: {
          $cond: [
            { $eq: ['$trackingType', 'batch'] },
            { $ifNull: ['$quantity', 1] },
            1
          ]
        }
      }
    },
    {
      $group: {
        _id: null,
        totalAnimals: { $sum: '$effectiveCount' },
        sickCount: {
          $sum: {
            $cond: [
              { $in: ['$healthStatus', ['sick', 'critical', 'under_treatment']] },
              '$effectiveCount',
              0
            ]
          }
        },
        criticalCount: {
          $sum: {
            $cond: [
              { $eq: ['$healthStatus', 'critical'] },
              '$effectiveCount',
              0
            ]
          }
        }
      }
    }
  ]);

  const bySpecies = await Livestock.aggregate([
    { $match: baseMatch },
    {
      $addFields: {
        effectiveCount: {
          $cond: [
            { $eq: ['$trackingType', 'batch'] },
            { $ifNull: ['$quantity', 1] },
            1
          ]
        }
      }
    },
    {
      $group: {
        _id: '$species',
        totalAnimals: { $sum: '$effectiveCount' },
        sickCount: {
          $sum: {
            $cond: [
              { $in: ['$healthStatus', ['sick', 'critical', 'under_treatment']] },
              '$effectiveCount',
              0
            ]
          }
        }
      }
    },
    { $sort: { totalAnimals: -1 } }
  ]);

  const byFarm = await Livestock.aggregate([
    { $match: baseMatch },
    {
      $addFields: {
        effectiveCount: {
          $cond: [
            { $eq: ['$trackingType', 'batch'] },
            { $ifNull: ['$quantity', 1] },
            1
          ]
        }
      }
    },
    {
      $group: {
        _id: '$farmId',
        totalAnimals: { $sum: '$effectiveCount' },
        sickCount: {
          $sum: {
            $cond: [
              { $in: ['$healthStatus', ['sick', 'critical', 'under_treatment']] },
              '$effectiveCount',
              0
            ]
          }
        }
      }
    },
    {
      $lookup: {
        from: 'farms',
        localField: '_id',
        foreignField: '_id',
        as: 'farm'
      }
    },
    { $unwind: { path: '$farm', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        farmId: '$_id',
        farmName: '$farm.name',
        totalAnimals: 1,
        sickCount: 1
      }
    },
    { $sort: { totalAnimals: -1 } }
  ]);

  return {
    overall: overall || { totalAnimals: 0, sickCount: 0, criticalCount: 0 },
    bySpecies,
    byFarm
  };
};
