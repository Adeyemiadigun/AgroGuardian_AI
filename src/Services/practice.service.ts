import CropSeason from "../Models/CropSeason";
import Farm from "../Models/Farm";
import Crop from "../Models/Crop";
import FarmPractice from "../Models/FarmPractice";
import PracticeActivityLog from "../Models/PracticeActivityLogs";
import Evidence from "../Models/Evidence";
import logger from "../Utils/logger";
import { ICropSeason, IPracticeActivityLogs } from "../Types/farm.practices.types";
import { calculateCarbonForActivity } from "./carbon.service";
import { verifyActivityEvidence } from "./verification.service";
import cloudinary from "../Config/cloudinary";

export const createCropSeason = async (
  userId: string,
  farmId: string,
  data: Partial<ICropSeason>
) => {
  const farm = await Farm.findOne({ _id: farmId, owner: userId });
  if (!farm) {
    throw new Error("Farm not found or you don't have permission");
  }

  const crop = await Crop.findById(data.cropId);
  if (!crop) {
    throw new Error("Crop type not found");
  }

  // Ensure area doesn't exceed farm size
  if (data.area! > farm.size) {
    throw new Error(`Crop area (${data.area}) cannot exceed farm size (${farm.size})`);
  }

  const cropSeason = await CropSeason.create({
    farmId,
    cropId: data.cropId,
    plantedDate: data.plantedDate || new Date(),
    area: data.area,
    areaUnit: data.areaUnit || farm.sizeUnit,
    status: "active",
  });

  logger.info(`Crop season created for farm ${farmId}, crop ${data.cropId}`);
  return cropSeason;
};

export const logPracticeActivity = async (
  userId: string,
  data: Partial<IPracticeActivityLogs>,
  imageBuffer?: Buffer
) => {
  const farm = await Farm.findOne({ _id: data.farmId, owner: userId });
  if (!farm) {
    throw new Error("Farm not found or you don't have permission");
  }

  const practice = await FarmPractice.findById(data.practiceId);
  if (!practice) {
    throw new Error("Practice not found");
  }

  // If cropSeasonId is provided, validate it
  if (data.cropSeasonId) {
    const cropSeason = await CropSeason.findOne({
      _id: data.cropSeasonId,
      farmId: data.farmId,
    });
    if (!cropSeason) {
      throw new Error("Crop season not found for this farm");
    }
    
    if (data.size! > cropSeason.area) {
        throw new Error(`Activity area (${data.size}) cannot exceed crop season area (${cropSeason.area})`);
    }
  } else {
      if (data.size! > farm.size) {
          throw new Error(`Activity area (${data.size}) cannot exceed farm size (${farm.size})`);
      }
  }

  const activityLog = await PracticeActivityLog.create({
    ...data,
    appliedBy: userId,
    status: "completed",
  });

  logger.info(`Practice activity logged: ${practice.name} on farm ${data.farmId}`);

  // Handle Evidence Upload
  if (imageBuffer) {
    try {
      const uploadResult = await new Promise<{ secure_url: string }>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "agroguardian/evidence", resource_type: "image" },
          (error, result) => {
            if (error || !result) return reject(error || new Error("Upload failed"));
            resolve(result);
          }
        );
        stream.end(imageBuffer);
      });

      const evidence = await Evidence.create({
        farmId: data.farmId,
        practiceLogId: activityLog._id,
        imageUrl: uploadResult.secure_url,
        uploadedBy: userId,
        description: `Evidence for ${practice.name}`,
      });
      logger.info(`Evidence uploaded for activity ${activityLog._id}`);

      // Trigger AI Verification asynchronously
      verifyActivityEvidence(evidence._id.toString()).catch(err => 
        logger.error("Automatic AI Verification trigger failed:", err)
      );

    } catch (err) {
      logger.error("Evidence upload failed:", err);
    }
  }
  
  // Trigger Carbon Calculation
  try {
    await calculateCarbonForActivity(activityLog._id.toString());
  } catch (err) {
    logger.error("Automatic carbon calculation trigger failed:", err);
  }
  
  return activityLog;
};

export const getFarmActivities = async (farmId: string, userId: string) => {
    const farm = await Farm.findOne({ _id: farmId, owner: userId });
    if (!farm) {
      throw new Error("Farm not found or you don't have permission");
    }
    
    return await PracticeActivityLog.find({ farmId })
        .populate("practiceId")
        .populate("cropId")
        .sort({ startDate: -1 });
};

export const getFarmCropSeasons = async (farmId: string, userId: string) => {
    const farm = await Farm.findOne({ _id: farmId, owner: userId });
    if (!farm) {
      throw new Error("Farm not found or you don't have permission");
    }
    
    return await CropSeason.find({ farmId })
        .populate("cropId")
        .sort({ plantedDate: -1 });
};
