import CropSeason from "../Models/CropSeason";
import Farm from "../Models/Farm";
import Crop from "../Models/Crop";
import FarmPractice from "../Models/FarmPractice";
import PracticeActivityLog from "../Models/PracticeActivityLogs";
import Evidence from "../Models/Evidence";
import logger from "../Utils/logger";
import { ICrop, ICropSeason, IPracticeActivityLogs } from "../Types/farm.practices.types";
import { calculateCarbonForActivity } from "./carbon.service";
import { upsertMonthlyAccrualForPracticeLog, backfillAccrualForPracticeLog } from "./carbon-accrual.service";
import { verifyActivityEvidence } from "./verification.service";
import cloudinary from "../Config/cloudinary";

const HECTARE_TO_ACRE = 2.47105;

const convertArea = (
  area: number,
  fromUnit: "acres" | "hectares",
  toUnit: "acres" | "hectares"
) => {
  if (fromUnit === toUnit) return area;
  if (fromUnit === "hectares" && toUnit === "acres") return area * HECTARE_TO_ACRE;
  if (fromUnit === "acres" && toUnit === "hectares") return area / HECTARE_TO_ACRE;
  return area;
};

const getUsedActiveSeasonArea = async (farmId: string, farmUnit: "acres" | "hectares") => {
  const active = await CropSeason.find({ farmId, status: "active" }).select("area areaUnit");
  return active.reduce((sum, s: any) => {
    const unit = (s.areaUnit || farmUnit) as "acres" | "hectares";
    return sum + convertArea(Number(s.area || 0), unit, farmUnit);
  }, 0);
};

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

type CropMaturityType = "annual" | "perennial";

type CropMaturity = {
  minDays: number;
  maxDays: number;
  type: CropMaturityType;
  notes?: string;
};

// Static Nigeria baseline maturity windows (approximate). For perennials, this is time-to-first-harvest.
const CROP_MATURITY_DAYS: Record<string, CropMaturity> = {
  // Cereals
  "Maize": { minDays: 90, maxDays: 120, type: "annual" },
  "Rice (African)": { minDays: 110, maxDays: 150, type: "annual" },
  "Rice (Asian)": { minDays: 110, maxDays: 150, type: "annual" },
  "Sorghum": { minDays: 100, maxDays: 130, type: "annual" },
  "Pearl Millet": { minDays: 80, maxDays: 110, type: "annual" },
  "Finger Millet": { minDays: 120, maxDays: 150, type: "annual" },
  "Teff": { minDays: 90, maxDays: 120, type: "annual" },
  "Fonio": { minDays: 70, maxDays: 90, type: "annual" },
  "Barley": { minDays: 90, maxDays: 120, type: "annual" },
  "Wheat": { minDays: 120, maxDays: 160, type: "annual" },
  "Oats": { minDays: 100, maxDays: 140, type: "annual" },

  // Legumes
  "Cowpea (Black-eyed pea)": { minDays: 60, maxDays: 90, type: "annual" },
  "Soybean": { minDays: 90, maxDays: 120, type: "annual" },
  "Groundnut (Peanut)": { minDays: 90, maxDays: 120, type: "annual" },
  "Pigeon Pea": { minDays: 150, maxDays: 240, type: "annual", notes: "Often harvested as annual/short-lived perennial." },
  "Bambara Nut": { minDays: 120, maxDays: 150, type: "annual" },
  "Kersting's Groundnut": { minDays: 120, maxDays: 150, type: "annual" },
  "Chickpeas": { minDays: 90, maxDays: 120, type: "annual" },
  "Lentils": { minDays: 80, maxDays: 110, type: "annual" },
  "Green Gram (Mung bean)": { minDays: 60, maxDays: 80, type: "annual" },
  "Common Bean": { minDays: 60, maxDays: 90, type: "annual" },

  // Tubers / roots
  "White Yam": { minDays: 210, maxDays: 300, type: "annual" },
  "Yellow Yam": { minDays: 210, maxDays: 300, type: "annual" },
  "Water Yam": { minDays: 210, maxDays: 300, type: "annual" },
  "Cassava": { minDays: 270, maxDays: 540, type: "annual" },
  "Irish Potato": { minDays: 90, maxDays: 120, type: "annual" },
  "Sweet Potato": { minDays: 90, maxDays: 150, type: "annual" },
  "Cocoyam (Taro)": { minDays: 210, maxDays: 300, type: "annual" },
  "Cocoyam (Tannia)": { minDays: 210, maxDays: 300, type: "annual" },
  "Livingstone Potato": { minDays: 240, maxDays: 300, type: "annual" },
  "Hausa Potato": { minDays: 90, maxDays: 120, type: "annual" },

  // Vegetables
  "Tomato": { minDays: 90, maxDays: 120, type: "annual" },
  "Onion": { minDays: 120, maxDays: 180, type: "annual" },
  "Habanero Pepper": { minDays: 90, maxDays: 150, type: "annual" },
  "Cayenne Pepper": { minDays: 90, maxDays: 150, type: "annual" },
  "Okra": { minDays: 60, maxDays: 90, type: "annual" },
  "Eggplant (Garden Egg)": { minDays: 90, maxDays: 120, type: "annual" },
  "African Spinach (Efo)": { minDays: 30, maxDays: 45, type: "annual" },
  "Amaranth": { minDays: 25, maxDays: 45, type: "annual" },
  "Jute Mallow (Ewedu)": { minDays: 30, maxDays: 50, type: "annual" },
  "Pumpkin leaves (Ugu)": { minDays: 90, maxDays: 150, type: "annual" },
  "Cabbage": { minDays: 90, maxDays: 120, type: "annual" },
  "Carrot": { minDays: 75, maxDays: 120, type: "annual" },
  "Lettuce": { minDays: 30, maxDays: 60, type: "annual" },
  "Green Beans": { minDays: 50, maxDays: 70, type: "annual" },
  "Cucumber": { minDays: 45, maxDays: 65, type: "annual" },

  // Fruits (many are perennials)
  "Mango": { minDays: 1095, maxDays: 1825, type: "perennial" },
  "Orange": { minDays: 1095, maxDays: 2190, type: "perennial" },
  "Pineapple": { minDays: 365, maxDays: 540, type: "annual", notes: "Often grown as a short-cycle plantation crop." },
  "Banana": { minDays: 365, maxDays: 540, type: "perennial" },
  "Plantain": { minDays: 365, maxDays: 540, type: "perennial" },
  "Pawpaw (Papaya)": { minDays: 180, maxDays: 300, type: "perennial" },
  "Watermelon": { minDays: 70, maxDays: 90, type: "annual" },
  "Avocado": { minDays: 1095, maxDays: 2555, type: "perennial" },
  "Guava": { minDays: 730, maxDays: 1095, type: "perennial" },
  "Cashew Apple": { minDays: 1095, maxDays: 1825, type: "perennial" },
  "African Star Apple (Agbalumo)": { minDays: 1825, maxDays: 2555, type: "perennial" },
  "Shea Fruit": { minDays: 3650, maxDays: 5475, type: "perennial" },
  "Baobab Fruit": { minDays: 3650, maxDays: 7300, type: "perennial" },

  // Beverage
  "Cocoa": { minDays: 1095, maxDays: 1825, type: "perennial" },
  "Coffee (Arabica)": { minDays: 1095, maxDays: 1460, type: "perennial" },
  "Coffee (Robusta)": { minDays: 1095, maxDays: 1460, type: "perennial" },
  "Tea": { minDays: 1095, maxDays: 1825, type: "perennial" },
  "Hibiscus (Zobo)": { minDays: 90, maxDays: 120, type: "annual" },
  "Kola Nut": { minDays: 1825, maxDays: 2555, type: "perennial" },

  // Oil
  "Oil Palm": { minDays: 1095, maxDays: 1825, type: "perennial" },
  "Groundnut": { minDays: 90, maxDays: 120, type: "annual" },
  "Coconut": { minDays: 1825, maxDays: 2555, type: "perennial" },
  "Sesame (Beniseed)": { minDays: 90, maxDays: 120, type: "annual" },
  "Sunflower": { minDays: 90, maxDays: 120, type: "annual" },
  "Cottonseed": { minDays: 150, maxDays: 200, type: "annual" },
  "Shea Nut": { minDays: 3650, maxDays: 5475, type: "perennial" },
  "Melon Seed (Egusi)": { minDays: 90, maxDays: 120, type: "annual" },

  // Fiber
  "Cotton": { minDays: 150, maxDays: 200, type: "annual" },
  "Jute": { minDays: 120, maxDays: 150, type: "annual" },
  "Sisal": { minDays: 1095, maxDays: 1825, type: "perennial" },
  "Kenaf": { minDays: 90, maxDays: 120, type: "annual" },
  "Raffia": { minDays: 1825, maxDays: 3650, type: "perennial" },
  "Flax": { minDays: 90, maxDays: 120, type: "annual" },

  // Spices
  "Ginger": { minDays: 240, maxDays: 300, type: "annual" },
  "Alligator Pepper": { minDays: 1095, maxDays: 1825, type: "perennial" },
  "Chili Pepper": { minDays: 90, maxDays: 150, type: "annual" },
  "Garlic": { minDays: 120, maxDays: 180, type: "annual" },
  "Turmeric": { minDays: 240, maxDays: 300, type: "annual" },
  "Cloves": { minDays: 1825, maxDays: 2555, type: "perennial" },
  "Nutmeg": { minDays: 1825, maxDays: 2555, type: "perennial" },
  "Cinnamon": { minDays: 1095, maxDays: 1825, type: "perennial" },
  "Black Pepper (Iyere)": { minDays: 1095, maxDays: 1460, type: "perennial" },

  // Latex
  "Rubber Tree": { minDays: 1825, maxDays: 2555, type: "perennial" },
  "Gum Arabic": { minDays: 1095, maxDays: 1825, type: "perennial" },

  // Forage
  "Alfalfa": { minDays: 90, maxDays: 120, type: "annual", notes: "First cut window; subsequent cuts recur." },
  "Napier Grass (Elephant Grass)": { minDays: 90, maxDays: 150, type: "perennial", notes: "Establishment window; then recurring harvests." },
  "Rhodes Grass": { minDays: 90, maxDays: 120, type: "annual" },
  "Guinea Grass": { minDays: 90, maxDays: 150, type: "perennial" },
  "Lablab": { minDays: 120, maxDays: 180, type: "annual" },
  "Stylosanthes": { minDays: 120, maxDays: 180, type: "perennial" },
  "Maize (Silage)": { minDays: 90, maxDays: 120, type: "annual" },
};

const CATEGORY_MATURITY_DEFAULTS: Record<string, CropMaturity> = {
  cereal: { minDays: 90, maxDays: 140, type: "annual" },
  legume: { minDays: 60, maxDays: 120, type: "annual" },
  tuber: { minDays: 180, maxDays: 360, type: "annual" },
  vegetable: { minDays: 45, maxDays: 120, type: "annual" },
  fruit: { minDays: 365, maxDays: 1825, type: "perennial" },
  beverage: { minDays: 365, maxDays: 1825, type: "perennial" },
  oil: { minDays: 90, maxDays: 1825, type: "annual" },
  fiber: { minDays: 90, maxDays: 365, type: "annual" },
  spice: { minDays: 90, maxDays: 365, type: "annual" },
  latex: { minDays: 365, maxDays: 2555, type: "perennial" },
  forage: { minDays: 60, maxDays: 180, type: "annual" },
};

const normalizeCropKey = (v: string) => v.trim().toLowerCase();

const toRange = (minDays: number, maxDays: number) => {
  const minWeeks = Math.max(1, Math.floor(minDays / 7));
  const maxWeeks = Math.max(minWeeks, Math.ceil(maxDays / 7));
  const minMonths = Math.max(1, Math.floor(minDays / 30));
  const maxMonths = Math.max(minMonths, Math.ceil(maxDays / 30));
  return { minWeeks, maxWeeks, minMonths, maxMonths };
};

type ResolvedMaturity = CropMaturity & { source: "crop" | "normalized" | "category" | "fallback" };

const resolveCropMaturity = (cropName: string, category?: string): ResolvedMaturity => {
  const direct = CROP_MATURITY_DAYS[cropName];
  if (direct) return { ...direct, source: "crop" };

  const normalized = normalizeCropKey(cropName);
  const key = Object.keys(CROP_MATURITY_DAYS).find((k) => normalizeCropKey(k) === normalized);
  if (key) return { ...CROP_MATURITY_DAYS[key], source: "normalized" };

  const byCategory = category ? CATEGORY_MATURITY_DEFAULTS[category] : undefined;
  if (byCategory) return { ...byCategory, source: "category" };

  return { minDays: 90, maxDays: 120, type: "annual", notes: "Default baseline", source: "fallback" };
};

export const getReferenceCropMaturity = async (category?: string, name?: string) => {
  const cat = category ? category.toLowerCase() : undefined;

  const categories = cat ? [cat] : Object.keys(MASTER_CROPS);
  const all: Array<{
    name: string;
    category: string;
    minDays: number;
    maxDays: number;
    type: CropMaturityType;
    notes?: string;
    minWeeks: number;
    maxWeeks: number;
    minMonths: number;
    maxMonths: number;
  }> = [];

  for (const c of categories) {
    const list = MASTER_CROPS[c] || [];
    for (const cropName of list) {
      const maturity =
        CROP_MATURITY_DAYS[cropName] ||
        CATEGORY_MATURITY_DEFAULTS[c] || { minDays: 90, maxDays: 120, type: "annual", notes: "Default baseline" };

      const range = toRange(maturity.minDays, maturity.maxDays);
      all.push({
        name: cropName,
        category: c,
        minDays: maturity.minDays,
        maxDays: maturity.maxDays,
        type: maturity.type,
        notes: maturity.notes,
        ...range,
      });
    }
  }

  if (name) {
    const key = normalizeCropKey(name);
    const found = all.find((c) => normalizeCropKey(c.name) === key);
    if (!found) {
      throw new Error("Crop not found in reference list for maturity lookup");
    }
    return found;
  }

  return all;
};

const DEFAULT_NIGERIA_PRACTICES: Array<{
  name: string;
  description: string;
  category: "soil" | "crop" | "water" | "agroforestry";
}> = [
  {
    name: "Mulching",
    description: "Cover soil with crop residues/grass to conserve moisture, reduce weeds, and protect against heat.",
    category: "soil",
  },
  {
    name: "Composting",
    description: "Convert farm waste to compost to improve soil structure and long-term fertility.",
    category: "soil",
  },
  {
    name: "Use of Organic Manure",
    description: "Apply poultry/cattle manure safely to improve soil nutrients and microbial activity.",
    category: "soil",
  },
  {
    name: "Cover Cropping",
    description: "Plant cover crops/legumes to protect soil, reduce erosion, and add nitrogen.",
    category: "soil",
  },
  {
    name: "Minimum Tillage (Conservation Agriculture)",
    description: "Reduce soil disturbance to retain moisture and reduce erosion, especially in dry seasons.",
    category: "soil",
  },
  {
    name: "Soil Testing & Balanced Fertilization",
    description: "Use soil tests to guide fertilizer/liming decisions and avoid nutrient waste.",
    category: "soil",
  },
  {
    name: "Green Manuring",
    description: "Incorporate green biomass/legumes to add organic matter and improve soil fertility.",
    category: "soil",
  },
  {
    name: "Lime Application (Acidic Soils)",
    description: "Apply agricultural lime where needed to correct soil acidity and improve nutrient availability.",
    category: "soil",
  },

  {
    name: "Crop Rotation",
    description: "Rotate cereals/legumes/tubers across seasons to reduce pests/diseases and improve soil health.",
    category: "crop",
  },
  {
    name: "Intercropping (Mixed Cropping)",
    description: "Grow complementary crops together (e.g., maize + cowpea) to diversify income and reduce risk.",
    category: "crop",
  },
  {
    name: "Use of Improved/Certified Seeds",
    description: "Use certified seeds/seedlings for better yield, uniformity, and resilience to common diseases.",
    category: "crop",
  },
  {
    name: "Integrated Pest Management (IPM)",
    description: "Combine scouting, cultural control, and safe pesticides only when needed to reduce losses.",
    category: "crop",
  },
  {
    name: "Timely Planting",
    description: "Plant early with the onset of rains (or irrigate) to maximize growing period and reduce drought impact.",
    category: "crop",
  },
  {
    name: "Weed Management (Timely Weeding)",
    description: "Control weeds early and consistently to reduce competition for water and nutrients.",
    category: "crop",
  },
  {
    name: "Field Sanitation",
    description: "Remove diseased plants/residues and keep field clean to reduce pest and disease carry-over.",
    category: "crop",
  },

  {
    name: "Raised Beds & Drainage Channels",
    description: "Use ridges/beds and drainage to reduce waterlogging during heavy rains.",
    category: "water",
  },
  {
    name: "Rainwater Harvesting",
    description: "Collect/store rainwater (tanks/ponds) for dry spells and off-season production.",
    category: "water",
  },
  {
    name: "Drip Irrigation",
    description: "Efficient irrigation that reduces water use and improves yields in dry areas.",
    category: "water",
  },
  {
    name: "Sprinkler Irrigation",
    description: "Supplement rainfall to stabilize yields; best with proper scheduling to reduce disease pressure.",
    category: "water",
  },
  {
    name: "Irrigation Scheduling",
    description: "Plan irrigation by crop stage and weather to reduce waste and avoid water stress.",
    category: "water",
  },

  {
    name: "Agroforestry (Trees on Farms)",
    description: "Integrate trees for shade, soil improvement, and additional income (e.g., cashew, mango, moringa).",
    category: "agroforestry",
  },
  {
    name: "Windbreaks / Shelterbelts",
    description: "Plant trees/hedges as windbreaks to reduce crop lodging and evapotranspiration.",
    category: "agroforestry",
  },
  {
    name: "Alley Cropping",
    description: "Grow crops between rows of trees/shrubs to reduce erosion and improve soil fertility over time.",
    category: "agroforestry",
  },
];

let nigeriaPracticesSeeded = false;
const ensureNigeriaPracticesSeeded = async () => {
  if (nigeriaPracticesSeeded) return;
  nigeriaPracticesSeeded = true;

  try {
    const now = new Date();
    await Promise.all(
      DEFAULT_NIGERIA_PRACTICES.map((p) =>
        FarmPractice.updateOne(
          { name: p.name },
          {
            // $set applies to both existing docs and newly upserted docs
            $set: {
              description: p.description,
              category: p.category,
              isActive: true,
              updatedAt: now,
            },
            // Only set fields that must exist only on insert
            $setOnInsert: {
              name: p.name,
              createdAt: now,
            },
          },
          { upsert: true }
        )
      )
    );
  } catch (error) {
    // Allow retry on next request
    nigeriaPracticesSeeded = false;
    logger.error("Failed to seed default Nigeria farm practices", error);
  }
};

export const getReferenceCrops = async (category?: string) => {
  if (category) {
    return MASTER_CROPS[category.toLowerCase()] || [];
  }
  return MASTER_CROPS;
};

export const getAllPractices = async () => {
  await ensureNigeriaPracticesSeeded();
  return await FarmPractice.find({ isActive: true }).sort({ category: 1, name: 1 });
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

export const deleteCrop = async (userId: string, farmId: string, cropId: string) => {
  const farm = await Farm.findOne({ _id: farmId, owner: userId });
  if (!farm) {
    throw new Error("Farm not found or you don't have permission");
  }

  const crop = await Crop.findOne({ _id: cropId, farmId, owner: userId });
  if (!crop) {
    throw new Error("Crop not found");
  }

  const seasonCount = await CropSeason.countDocuments({ farmId, cropId });
  if (seasonCount > 0) {
    throw new Error("Cannot delete crop: it is used by one or more seasons");
  }

  const activityCount = await PracticeActivityLog.countDocuments({ farmId, cropId });
  if (activityCount > 0) {
    throw new Error("Cannot delete crop: it is referenced by practice logs");
  }

  await Crop.deleteOne({ _id: cropId });
  logger.info(`Crop ${cropId} deleted for farm ${farmId}`);
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

  const crop = await Crop.findOne({ _id: data.cropId, farmId, owner: userId });
  if (!crop) {
    throw new Error("Crop type not found for this farm");
  }

  if (data.areaUnit && data.areaUnit !== farm.sizeUnit) {
    throw new Error(`Area unit must be ${farm.sizeUnit} for this farm`);
  }

  const usedActiveArea = await getUsedActiveSeasonArea(farmId, farm.sizeUnit as any);
  const remaining = Math.max(0, Number(farm.size || 0) - usedActiveArea);

  if (Number(data.area) > remaining) {
    throw new Error(`Not enough available land. Remaining: ${remaining} ${farm.sizeUnit}`);
  }

  const cropSeason = await CropSeason.create({
    farmId,
    cropId: data.cropId,
    plantedDate: data.plantedDate || new Date(),
    area: data.area,
    areaUnit: farm.sizeUnit,
    status: "active",
  });

  logger.info(`Crop season created for farm ${farmId}, crop ${data.cropId}`);
  return cropSeason;
};

export const updateCropSeason = async (
  userId: string,
  farmId: string,
  seasonId: string,
  updates: Partial<ICropSeason>
) => {
  const farm = await Farm.findOne({ _id: farmId, owner: userId });
  if (!farm) {
    throw new Error("Farm not found or you don't have permission");
  }

  const season = await CropSeason.findOne({ _id: seasonId, farmId });
  if (!season) {
    throw new Error("Crop season not found");
  }

  if (updates.areaUnit && updates.areaUnit !== farm.sizeUnit) {
    throw new Error(`Area unit must be ${farm.sizeUnit} for this farm`);
  }

  const nextStatus = (updates.status || season.status) as any;
  const nextArea = updates.area != null ? Number(updates.area) : Number(season.area);

  if (nextStatus === "active") {
    const totalUsed = await getUsedActiveSeasonArea(farmId, farm.sizeUnit as any);
    const currentAreaInFarmUnit = season.status === "active"
      ? convertArea(Number(season.area || 0), (season.areaUnit || farm.sizeUnit) as any, farm.sizeUnit as any)
      : 0;

    const usedExceptThis = Math.max(0, totalUsed - currentAreaInFarmUnit);
    const remainingForThis = Math.max(0, Number(farm.size || 0) - usedExceptThis);

    if (nextArea > remainingForThis) {
      throw new Error(`Not enough available land. Remaining: ${remainingForThis} ${farm.sizeUnit}`);
    }
  }

  if (updates.plantedDate) season.plantedDate = updates.plantedDate as any;
  if (updates.area != null) season.area = nextArea as any;
  if (updates.status) season.status = updates.status as any;
  if ((updates as any).harvestDate) (season as any).harvestDate = (updates as any).harvestDate;

  await season.save();
  logger.info(`Crop season ${seasonId} updated for farm ${farmId}`);
  return season;
};

export const deleteCropSeason = async (userId: string, farmId: string, seasonId: string) => {
  const farm = await Farm.findOne({ _id: farmId, owner: userId });
  if (!farm) {
    throw new Error("Farm not found or you don't have permission");
  }

  const season = await CropSeason.findOne({ _id: seasonId, farmId });
  if (!season) {
    throw new Error("Crop season not found");
  }

  const activityCount = await PracticeActivityLog.countDocuments({ farmId, cropSeasonId: seasonId });
  if (activityCount > 0) {
    throw new Error("Cannot delete season: it is referenced by practice logs");
  }

  await CropSeason.deleteOne({ _id: seasonId });
  logger.info(`Crop season ${seasonId} deleted for farm ${farmId}`);
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
    // If no start photo is provided, the activity is immediately "active".
    status: imageBuffer ? "pending_start" : "active",
    verificationFlags: [],
  });

  // Create/update historical and current monthly estimated accrual credits immediately (non-blocking)
  Promise.all([
    upsertMonthlyAccrualForPracticeLog(activityLog._id.toString()),
    backfillAccrualForPracticeLog(activityLog._id.toString(), {
      targetStatus: "pending-verification",
      isEstimated: true,
    })
  ]).catch((err) =>
    logger.error("Accrual backfill failed", { activityLogId: String(activityLog._id), err })
  );

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

      // Pass the raw buffer for EXIF extraction (Now awaiting to return result to frontend)
      try {
        await verifyActivityEvidence(evidence._id.toString(), imageBuffer);
      } catch (err) {
        logger.error("AI Verification trigger failed:", err);
      }

      // Re-fetch to get updated status and description
      const updatedLog = await PracticeActivityLog.findById(activityLog._id);
      const updatedEvidence = await Evidence.findById(evidence._id);

      return { activity: updatedLog, evidence: updatedEvidence };

    } catch (err) {
      logger.error("Start evidence upload failed:", err);
    }
  }
  
  return { activity: activityLog };
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

  // Maturity gate: if activity is linked to a crop season, require minimum maturity days since season start.
  // Also consider the season's projected end (harvestDate) as a sanity check (end-start must not be shorter than min maturity).
  if (activityLog.cropSeasonId) {
    const season = await CropSeason.findOne({ _id: activityLog.cropSeasonId, farmId: activityLog.farmId });
    if (!season) {
      throw new Error("Crop season not found for this activity");
    }

    const crop = await Crop.findById(season.cropId);
    if (!crop) {
      throw new Error("Crop not found for this season");
    }

    const maturity = resolveCropMaturity(crop.name, crop.category);
    const planted = new Date(season.plantedDate);
    const now = new Date();
    const DAY_MS = 1000 * 60 * 60 * 24;

    const rawDays = Math.floor((now.getTime() - planted.getTime()) / DAY_MS);
    const daysSincePlanted = Number.isFinite(rawDays) ? Math.max(0, rawDays) : NaN;

    const projectedHarvest = season.harvestDate ? new Date(season.harvestDate) : null;
    if (projectedHarvest) {
      const rawTotal = Math.floor((projectedHarvest.getTime() - planted.getTime()) / DAY_MS);
      const totalSeasonDays = Number.isFinite(rawTotal) ? rawTotal : NaN;

      if (Number.isFinite(totalSeasonDays) && totalSeasonDays < maturity.minDays) {
        throw new Error(
          `Projected harvest date is too early for ${crop.name}. Your season is ~${totalSeasonDays} day(s) long, but minimum maturity is ${maturity.minDays} day(s). Please edit the season harvest date.`
        );
      }
    }

    if (!Number.isFinite(daysSincePlanted)) {
      logger.warn("Invalid plantedDate for crop season; skipping maturity gate", { cropSeasonId: String(season._id) });
    } else if (daysSincePlanted < maturity.minDays) {
      const remaining = Math.max(0, maturity.minDays - daysSincePlanted);
      throw new Error(
        `Too early to upload completion evidence. ${crop.name} needs at least ${maturity.minDays} days from season start (current: ${daysSincePlanted} days). Wait ~${remaining} more days.`
      );
    }
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

    // Trigger AI Verification for the END photo (Now awaiting to return result to frontend)
    try {
      await verifyActivityEvidence(evidence._id.toString(), imageBuffer);
    } catch (err) {
      logger.error("AI Verification trigger failed for completion:", err);
    }

    // Re-fetch to get updated status and description
    const updatedLog = await PracticeActivityLog.findById(activityLog._id);
    const updatedEvidence = await Evidence.findById(evidence._id);

    return { activity: updatedLog, evidence: updatedEvidence };
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

  const logs: any[] = await PracticeActivityLog.find({ farmId })
    .populate("practiceId")
    .populate("cropId")
    .populate("cropSeasonId")
    .sort({ startDate: -1 })
    .lean();

  return logs.map((a) => {
    const crop = a?.cropId && typeof a.cropId === "object" ? a.cropId : null;
    const season = a?.cropSeasonId && typeof a.cropSeasonId === "object" ? a.cropSeasonId : null;

    if (!crop || !season?.plantedDate) return a;

    const maturity = resolveCropMaturity(crop.name, crop.category);
    const range = toRange(maturity.minDays, maturity.maxDays);

    const planted = new Date(season.plantedDate);
    const now = new Date();
    const DAY_MS = 1000 * 60 * 60 * 24;

    const rawDays = Math.floor((now.getTime() - planted.getTime()) / DAY_MS);
    const daysSincePlanted = Number.isFinite(rawDays) ? Math.max(0, rawDays) : null;

    if (daysSincePlanted == null) return a;

    const projectedHarvest = season.harvestDate ? new Date(season.harvestDate) : null;
    const rawTotal = projectedHarvest ? Math.floor((projectedHarvest.getTime() - planted.getTime()) / DAY_MS) : null;
    const totalSeasonDays = rawTotal != null && Number.isFinite(rawTotal) ? rawTotal : null;
    const rawToHarvest = projectedHarvest ? Math.ceil((projectedHarvest.getTime() - now.getTime()) / DAY_MS) : null;
    const daysToProjectedHarvest = rawToHarvest != null && Number.isFinite(rawToHarvest) ? rawToHarvest : null;

    let blockedReason: string | null = null;
    if (totalSeasonDays != null && totalSeasonDays < maturity.minDays) {
      blockedReason = `Projected harvest date is too early for ${crop.name}. Season is ~${totalSeasonDays} day(s), but minimum maturity is ${maturity.minDays} day(s). Please edit the season harvest date.`;
    } else if (daysSincePlanted < maturity.minDays) {
      const remaining = Math.max(0, maturity.minDays - daysSincePlanted);
      blockedReason = `Too early to upload completion evidence. Wait ~${remaining} more day(s) for crop maturity.`;
    }

    const isMatured = blockedReason == null && daysSincePlanted >= maturity.minDays;
    const remainingDaysToMin = Math.max(0, maturity.minDays - daysSincePlanted);

    return {
      ...a,
      completionEligibility: {
        daysSincePlanted,
        isMatured,
        remainingDaysToMin,
        blockedReason,
        projected: projectedHarvest
          ? {
              harvestDate: projectedHarvest,
              totalSeasonDays,
              daysToProjectedHarvest,
            }
          : null,
        requiredMaturity: {
          minDays: maturity.minDays,
          maxDays: maturity.maxDays,
          type: maturity.type,
          notes: maturity.notes,
          source: maturity.source,
          ...range,
        },
      },
    };
  });
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
