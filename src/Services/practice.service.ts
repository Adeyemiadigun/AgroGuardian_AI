import CropSeason from "../Models/CropSeason";
import Farm from "../Models/Farm";
import Crop from "../Models/Crop";
import FarmPractice from "../Models/FarmPractice";
import PracticeActivityLog from "../Models/PracticeActivityLogs";
import Evidence from "../Models/Evidence";
import logger from "../Utils/logger";
import { ICrop, ICropSeason, IPracticeActivityLogs } from "../Types/farm.practices.types";
import { calculateCarbonForActivity } from "./carbon.service";
import { verifyActivityEvidence } from "./verification.service";
import cloudinary from "../Config/cloudinary";

const CATEGORY_MULTIPLIERS = {
  cereal: 1.1,
  legume: 1.5,
  tuber: 1.0,
  vegetable: 1.0,
  fruit: 1.8,
  beverage: 2.0,
  oil: 1.4,
  fiber: 1.2,
  spice: 1.1,
  latex: 2.5,
  forage: 1.6,
};

const MASTER_CROPS: Record<string, string[]> = {
  cereal: ["Maize", "Rice (African)", "Rice (Asian)", "Sorghum", "Pearl Millet", "Finger Millet", "Teff", "Fonio", "Barley", "Wheat", "Oats"],
  legume: ["Cowpea (Black-eyed pea)", "Soybean", "Groundnut (Peanut)", "Pigeon Pea", "Bambara Nut", "Kersting's Groundnut", "Chickpeas", "Lentils", "Green Gram (Mung bean)", "Common Bean"],
  tuber: ["White Yam", "Yellow Yam", "Water Yam", "Cassava", "Irish Potato", "Sweet Potato", "Cocoyam (Taro)", "Cocoyam (Tannia)", "Livingstone Potato", "Hausa Potato"],
  vegetable: ["Tomato", "Onion", "Habanero Pepper", "Cayenne Pepper", "Okra", "Eggplant (Garden Egg)", "African Spinach (Efo)", "Amaranth", "Jute Mallow (Ewedu)", "Pumpkin leaves (Ugu)", "Cabbage", "Carrot", "Lettuce", "Green Beans", "Cucumber"],
  fruit: ["Mango", "Orange", "Pineapple", "Banana", "Plantain", "Pawpaw (Papaya)", "Watermelon", "Avocado", "Guava", "Cashew Apple", "African Star Apple (Agbalumo)", "Shea Fruit", "Baobab Fruit"],
  beverage: ["Cocoa", "Coffee (Arabica)", "Coffee (Robusta)", "Tea", "Hibiscus (Zobo)", "Kola Nut"],
  oil: ["Oil Palm", "Groundnut", "Coconut", "Soybean", "Sesame (Beniseed)", "Sunflower", "Cottonseed", "Shea Nut", "Melon Seed (Egusi)"],
  fiber: ["Cotton", "Jute", "Sisal", "Kenaf", "Raffia", "Flax"],
  spice: ["Ginger", "Alligator Pepper", "Chili Pepper", "Onion", "Garlic", "Turmeric", "Cloves", "Nutmeg", "Cinnamon", "Black Pepper (Iyere)"],
  latex: ["Rubber Tree", "Gum Arabic"],
  forage: ["Alfalfa", "Sorghum", "Napier Grass (Elephant Grass)", "Rhodes Grass", "Guinea Grass", "Lablab", "Stylosanthes", "Maize (Silage)"],
};

export const getReferenceCrops = async (category?: string) => {
  if (category) {
    return MASTER_CROPS[category.toLowerCase()] || [];
  }
  return MASTER_CROPS;
};

export const getAllPractices = async () => {
  return await FarmPractice.find({ isActive: true });
};

export const addCropToFarm = async (
  userId: string,
  farmId: string,
  data: { name: string; category: ICrop["category"] }
) => {
  const farm = await Farm.findOne({ _id: farmId, owner: userId });
  if (!farm) {
    throw new Error("Farm not found or you don't have permission");
  }

  const carbonMultiplier = CATEGORY_MULTIPLIERS[data.category as keyof typeof CATEGORY_MULTIPLIERS] || 1.0;

  const crop = await Crop.create({
    farmId,
    owner: userId,
    name: data.name,
    category: data.category,
    carbonMultiplier: carbonMultiplier,
  });

  logger.info(`Crop ${data.name} added to farm ${farmId} with multiplier ${carbonMultiplier}`);
  return crop;
};

export const getFarmCrops = async (farmId: string, userId: string) => {
  const farm = await Farm.findOne({ _id: farmId, owner: userId });
  if (!farm) {
    throw new Error("Farm not found or you don't have permission");
  }
  return await Crop.find({ farmId }).sort({ createdAt: -1 });
};

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

/**
 * PHASE 1: Start a practice activity (Status: pending_start)
 */
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

  if (!farm.soilType.includes(data.soilType as any)) {
    throw new Error(`Soil type ${data.soilType} is not registered for this farm. Choose from: ${farm.soilType.join(", ")}`);
  }

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
    status: "pending_start",
    verificationFlags: []
  });

  logger.info(`Practice activity initiated: ${practice.name} on farm ${data.farmId}`);

  if (imageBuffer) {
    try {
      const uploadResult = await new Promise<{ secure_url: string }>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "agroguardian/evidence", resource_type: "image" },
          (error: any, result: any) => {
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
        evidenceType: "start",
        uploadedBy: userId,
        description: `Start evidence for ${practice.name}`,
      });
      
      activityLog.startEvidenceId = evidence._id;
      await activityLog.save();
      
      logger.info(`Start evidence uploaded for activity ${activityLog._id}`);

      // Pass the raw buffer for EXIF extraction
      verifyActivityEvidence(evidence._id.toString(), imageBuffer).catch(err => 
        logger.error("AI Verification trigger failed:", err)
      );

    } catch (err) {
      logger.error("Start evidence upload failed:", err);
    }
  }
  
  return activityLog;
};

/**
 * PHASE 2: Complete a practice activity (Status: pending_end)
 */
export const completePracticeActivity = async (
  userId: string,
  activityId: string,
  imageBuffer: Buffer,
  notes?: string
) => {
  const activityLog = await PracticeActivityLog.findOne({ _id: activityId, appliedBy: userId });
  if (!activityLog) throw new Error("Practice activity not found");
  
  if (activityLog.status !== "active" && activityLog.status !== "pending_start") {
    throw new Error(`Cannot complete activity with status: ${activityLog.status}`);
  }

  const practice = await FarmPractice.findById(activityLog.practiceId);
  const practiceName = practice?.name || "Practice";

  // Upload End Evidence
  try {
    const uploadResult = await new Promise<{ secure_url: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: "agroguardian/evidence", resource_type: "image" },
        (error: any, result: any) => {
          if (error || !result) return reject(error || new Error("Upload failed"));
          resolve(result);
        }
      );
      stream.end(imageBuffer);
    });

    const evidence = await Evidence.create({
      farmId: activityLog.farmId,
      practiceLogId: activityLog._id,
      imageUrl: uploadResult.secure_url,
      evidenceType: "end",
      uploadedBy: userId,
      description: `Completion evidence for ${practiceName}. ${notes || ""}`,
    });
    
    activityLog.endEvidenceId = evidence._id;
    activityLog.status = "pending_end";
    if (notes) activityLog.notes = `${activityLog.notes || ""}\n\nCompletion Notes: ${notes}`;
    await activityLog.save();

    logger.info(`Completion evidence uploaded for activity ${activityLog._id}`);

    // Trigger AI Verification for the END photo
    // This will trigger carbon calculation inside verifyActivityEvidence if end photo is valid
    verifyActivityEvidence(evidence._id.toString(), imageBuffer).catch(err => 
      logger.error("AI Verification trigger failed for completion:", err)
    );

    return activityLog;
  } catch (err: any) {
    logger.error("Completion evidence upload failed:", err);
    throw new Error(`Failed to complete activity: ${err.message}`);
  }
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
