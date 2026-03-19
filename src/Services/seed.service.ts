import Crop from "../Models/Crop";
import FarmPractice from "../Models/FarmPractice";
import CarbonFactor from "../Models/CarbonFactor";
import logger from "../Utils/logger";

export const seedDatabase = async () => {
  try {
    // 1. Seed Crops
    const crops = [
      { name: "Maize", category: "cereal", carbonMultiplier: 1.2 },
      { name: "Rice", category: "cereal", carbonMultiplier: 1.1 },
      { name: "Soybean", category: "legume", carbonMultiplier: 1.5 },
      { name: "Cocoa", category: "tree", carbonMultiplier: 2.5 },
    ];

    await Crop.deleteMany({});
    const seededCrops = await Crop.insertMany(crops);
    logger.info(`Seeded ${seededCrops.length} crops`);

    // 2. Seed Practices
    const practices = [
      { 
        name: "No-Till", 
        description: "Minimal soil disturbance to preserve carbon and structure.", 
        category: "soil", 
        isActive: true 
      },
      { 
        name: "Cover Cropping", 
        description: "Planting crops to cover the soil rather than for harvest.", 
        category: "crop", 
        isActive: true 
      },
      { 
        name: "Agroforestry", 
        description: "Integration of trees and shrubs into crop and livestock systems.", 
        category: "agroforestry", 
        isActive: true 
      },
    ];

    await FarmPractice.deleteMany({});
    const seededPractices = await FarmPractice.insertMany(practices);
    logger.info(`Seeded ${seededPractices.length} practices`);

    // 3. Seed Carbon Factors (Sample)
    const carbonFactors = [
      {
        practiceId: seededPractices[0]._id, // No-Till
        cropId: seededCrops[0]._id, // Maize
        soilType: "clay-loam",
        climateZone: "tropical",
        carbonFactorPerHectarePerYear: 0.5,
      },
      {
        practiceId: seededPractices[1]._id, // Cover Cropping
        cropId: seededCrops[2]._id, // Soybean
        soilType: "sandy-loam",
        climateZone: "tropical",
        carbonFactorPerHectarePerYear: 0.8,
      },
      {
        practiceId: seededPractices[2]._id, // Agroforestry
        cropId: seededCrops[3]._id, // Cocoa
        soilType: "loamy",
        climateZone: "tropical",
        carbonFactorPerHectarePerYear: 2.2,
      },
    ];

    await CarbonFactor.deleteMany({});
    const seededFactors = await CarbonFactor.insertMany(carbonFactors);
    logger.info(`Seeded ${seededFactors.length} carbon factors`);

    return {
      crops: seededCrops.length,
      practices: seededPractices.length,
      carbonFactors: seededFactors.length,
    };
  } catch (error: any) {
    logger.error("Seeding error:", error);
    throw new Error(`Seeding failed: ${error.message}`);
  }
};
