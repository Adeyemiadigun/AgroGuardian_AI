import { z } from "zod";

// Species enum
const speciesEnum = z.enum(["cattle", "goat", "sheep", "pig", "poultry", "fish", "rabbit"]);
const trackingTypeEnum = z.enum(["individual", "batch"]);
const genderEnum = z.enum(["male", "female", "unknown"]);
const statusEnum = z.enum(["active", "sold", "deceased", "quarantined", "breeding"]);
const healthStatusEnum = z.enum(["healthy", "sick", "recovering", "under_treatment", "critical"]);
const poultryTypeEnum = z.enum([
  "broiler",
  "layer",
  "noiler",
  "kuroiler",
  "cockerel",
  "pullet",
  "dual_purpose",
  "turkey",
  "duck",
  "guinea_fowl",
  "quail",
]);
const fishTypeEnum = z.enum(["tilapia", "catfish", "carp", "salmon", "trout", "other"]);

// Create Livestock Schema
export const createLivestockSchema = z.object({
  farmId: z.string().min(1, "Farm ID is required"),
  
  // Basic info
  tagId: z.string().max(50).optional(),
  species: speciesEnum,
  breed: z.string().max(100).optional(),
  trackingType: trackingTypeEnum,
  
  // Batch tracking
  quantity: z.number().int().positive().optional(),
  batchId: z.string().max(50).optional(),
  
  // Individual tracking
  gender: genderEnum.optional(),
  dateOfBirth: z.string().datetime().optional().or(z.string().optional()),
  acquisitionDate: z.string().datetime().or(z.string()),
  acquisitionMethod: z.enum(["birth", "purchase", "gift", "other"]).optional(),
  acquisitionCost: z.number().nonnegative().optional(),
  cost: z.number().nonnegative().optional(),
  
  // Physical
  weight: z.number().positive().optional(),
  color: z.string().max(50).optional(),
  markings: z.string().max(200).optional(),
  
  // Status
  status: statusEnum.optional(),
  healthStatus: healthStatusEnum.optional(),
  
  // Species-specific
  poultryType: poultryTypeEnum.optional(),
  fishType: fishTypeEnum.optional(),
  housingUnit: z.string().max(100).optional(),
  
  // Lineage
  sireId: z.string().optional(),
  damId: z.string().optional(),
  
  // Notes
  notes: z.string().max(1000).optional()
}).refine((data) => {
  // Batch tracking requires quantity
  if (data.trackingType === "batch" && (!data.quantity || data.quantity < 1)) {
    return false;
  }
  return true;
}, {
  message: "Batch tracking requires a quantity greater than 0",
  path: ["quantity"]
}).refine((data) => {
  // Purchase requires purchase amount (but don't break older clients that omit acquisitionMethod)
  if (data.acquisitionMethod === "purchase" && (data.acquisitionCost == null || Number.isNaN(data.acquisitionCost as any))) {
    return false;
  }
  return true;
}, {
  message: "Purchase amount is required when acquisition method is purchase",
  path: ["acquisitionCost"]
}).refine((data) => {
  // Batch tracking requires average weight
  if (data.trackingType === "batch" && (!data.weight || data.weight <= 0)) {
    return false;
  }
  return true;
}, {
  message: "Batch tracking requires an average weight per animal",
  path: ["weight"]
}).refine((data) => {
  // Poultry should have poultryType
  if (data.species === "poultry" && !data.poultryType) {
    return false;
  }
  return true;
}, {
  message: "Poultry species requires a poultry type",
  path: ["poultryType"]
}).refine((data) => {
  // Poultry batches should have hatch date (stored as dateOfBirth)
  if (data.species === "poultry" && data.trackingType === "batch" && (!data.dateOfBirth || data.dateOfBirth.toString().trim().length === 0)) {
    return false;
  }
  return true;
}, {
  message: "Poultry batches require a hatch date",
  path: ["dateOfBirth"]
}).refine((data) => {
  // Tag/ID is required only for specific species when tracking individually
  const tagRequiredSpecies = ["cattle", "goat", "sheep", "pig", "rabbit"] as const;
  const tagRequired = data.trackingType === "individual" && tagRequiredSpecies.includes(data.species as any);
  if (tagRequired && (!data.tagId || data.tagId.trim().length === 0)) {
    return false;
  }
  return true;
}, {
  message: "Tag/ID Number is required for this animal",
  path: ["tagId"]
});

// Update Livestock Schema
export const updateLivestockSchema = z.object({
  tagId: z.string().max(50).optional(),
  breed: z.string().max(100).optional(),
  quantity: z.number().int().positive().optional(),
  gender: genderEnum.optional(),
  dateOfBirth: z.string().datetime().optional().or(z.string().optional()),
  weight: z.number().positive().optional(),
  color: z.string().max(50).optional(),
  markings: z.string().max(200).optional(),
  status: statusEnum.optional(),
  healthStatus: healthStatusEnum.optional(),

  // Species-specific (allow updating type)
  poultryType: poultryTypeEnum.optional(),
  fishType: fishTypeEnum.optional(),

  housingUnit: z.string().max(100).optional(),
  notes: z.string().max(1000).optional()
});

// Add Weight Record Schema
export const addWeightSchema = z.object({
  weight: z.number().positive("Weight must be positive"),
  unit: z.enum(["kg", "lbs"]).optional(),
  notes: z.string().max(500).optional()
});

// Health Record Schema
export const createHealthRecordSchema = z.object({
  livestockId: z.string().min(1, "Livestock ID is required"),
  recordType: z.enum(["vaccination", "treatment", "illness", "checkup", "deworming"]),
  
  // Vaccination fields
  vaccineName: z.string().max(200).optional(),
  vaccineType: z.string().max(100).optional(),
  dosage: z.string().max(100).optional(),
  administeredBy: z.string().max(100).optional(),
  nextDueDate: z.string().datetime().optional().or(z.string().optional()),
  
  // Treatment/Illness fields
  condition: z.string().max(200).optional(),
  symptoms: z.array(z.string()).optional(),
  diagnosis: z.string().max(500).optional(),
  medications: z.array(z.object({
    name: z.string(),
    dosage: z.string(),
    frequency: z.string(),
    duration: z.string().optional(),
    administeredBy: z.string().optional()
  })).optional(),
  treatmentDuration: z.number().int().positive().optional(),
  
  // General
  recordDate: z.string().datetime().or(z.string()),
  notes: z.string().max(1000).optional(),
  cost: z.number().nonnegative().optional()
});

// Diagnosis Request Schema
export const createDiagnosisSchema = z.object({
  farmId: z.string().min(1, "Farm ID is required"),
  livestockId: z.string().optional(),
  species: speciesEnum,
  animalDescription: z.string().max(500).optional()
});

// Feeding Record Schema
export const createFeedingSchema = z.object({
  livestockId: z.string().optional(),
  farmId: z.string().min(1, "Farm ID is required"),
  feedType: z.string().min(1).max(200),
  feedBrand: z.string().max(100).optional(),
  quantity: z.number().positive(),
  unit: z.enum(["kg", "lbs", "bags", "liters"]).optional(),
  feedingTime: z.string().datetime().or(z.string()),
  scheduleType: z.enum(["morning", "afternoon", "evening", "ad_libitum"]).optional(),
  costPerUnit: z.number().nonnegative().optional(),
  totalCost: z.number().nonnegative().optional(),
  batchId: z.string().optional(),
  animalsCount: z.number().int().positive().optional(),
  notes: z.string().max(500).optional()
});

// Feeding Schedule Schema (Reminders)
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:mm');
const daysOfWeek = z.array(z.number().int().min(0).max(6)).optional();

const feedingScheduleBaseSchema = z.object({
  livestockId: z.string().optional(),
  timesOfDay: z.array(hhmm).min(1, 'At least one reminder time is required'),
  daysOfWeek,
  timezone: z.string().optional(),
  scheduleType: z.enum(["morning", "afternoon", "evening", "ad_libitum"]).optional(),
  feedType: z.string().max(200).optional(),
  feedBrand: z.string().max(100).optional(),
  enabled: z.boolean().optional(),
  notes: z.string().max(500).optional(),
});

export const createFeedingScheduleSchema = feedingScheduleBaseSchema.refine((data) => {
  const unique = new Set(data.timesOfDay);
  return unique.size === data.timesOfDay.length;
}, {
  message: 'Duplicate times are not allowed',
  path: ['timesOfDay'],
});

export const updateFeedingScheduleSchema = feedingScheduleBaseSchema
  .partial()
  .superRefine((data, ctx) => {
    if (Array.isArray(data.timesOfDay)) {
      const unique = new Set(data.timesOfDay);
      if (unique.size !== data.timesOfDay.length) {
        ctx.addIssue({
          code: 'custom',
          message: 'Duplicate times are not allowed',
          path: ['timesOfDay'],
        });
      }
    }
  });

// Breeding Record Schema
export const createBreedingSchema = z.object({
  farmId: z.string().min(1, "Farm ID is required"),
  damId: z.string().min(1, "Dam (mother) ID is required"),
  sireId: z.string().optional(),
  breedingDate: z.string().datetime().or(z.string()),
  breedingMethod: z.enum(["natural", "artificial_insemination"]).optional(),
  notes: z.string().max(500).optional()
});

// Update Breeding Status Schema
export const updateBreedingSchema = z.object({
  isPregnant: z.boolean().optional(),
  expectedDueDate: z.string().datetime().optional().or(z.string().optional()),
  gestationDays: z.number().int().positive().optional(),
  birthDate: z.string().datetime().optional().or(z.string().optional()),
  offspringCount: z.number().int().nonnegative().optional(),
  birthComplications: z.string().max(500).optional(),
  status: z.enum(["bred", "confirmed_pregnant", "delivered", "failed", "aborted"]).optional(),
  notes: z.string().max(500).optional()
});

// Inventory Transaction Schema
export const createInventorySchema = z.object({
  farmId: z.string().min(1, "Farm ID is required"),
  livestockId: z.string().optional(),
  transactionType: z.enum(["purchase", "sale", "birth", "death", "gift_in", "gift_out", "transfer"]),
  species: speciesEnum,
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative().optional(),
  totalAmount: z.number().nonnegative().optional(),
  currency: z.string().max(10).optional(),
  transactionDate: z.string().datetime().or(z.string()),
  counterparty: z.string().max(200).optional(),
  causeOfDeath: z.string().max(500).optional(),
  breedingRecordId: z.string().optional(),
  notes: z.string().max(1000).optional()
});

// Vet Consultation Schema
export const createVetConsultationSchema = z.object({
  farmId: z.string().min(1, "Farm ID is required"),
  livestockId: z.string().optional(),
  species: speciesEnum,
  animalName: z.string().max(100).optional(),
  issueType: z.enum(["disease", "injury", "nutrition", "breeding", "behavior", "general"]).optional(),
  initialMessage: z.string().min(1, "Please describe the issue").max(2000)
});

// Send Message Schema
export const sendVetMessageSchema = z.object({
  message: z.string().min(1, "Message cannot be empty").max(2000)
});
