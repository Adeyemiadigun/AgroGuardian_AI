import { Document, Types } from "mongoose";
import { IFarm } from "./farm.types";
import { IUser } from "./auth.types";

// Supported livestock species
export type LivestockSpecies = 
  | "cattle" 
  | "goat" 
  | "sheep" 
  | "pig" 
  | "poultry" 
  | "fish"
  | "rabbit";

// Tracking type - individual animals or batches
export type TrackingType = "individual" | "batch";

// Gender for individual animals
export type LivestockGender = "male" | "female" | "unknown";

// Status of livestock
export type LivestockStatus = 
  | "active" 
  | "sold" 
  | "deceased" 
  | "quarantined" 
  | "breeding";

// Health status
export type HealthStatus = 
  | "healthy" 
  | "sick" 
  | "recovering" 
  | "under_treatment" 
  | "critical";

// Poultry types
export type PoultryType = 
  | "broiler" 
  | "layer" 
  | "noiler"
  | "kuroiler"
  | "cockerel"
  | "pullet"
  | "dual_purpose" 
  | "turkey" 
  | "duck" 
  | "guinea_fowl" 
  | "quail";

// Fish types
export type FishType = 
  | "tilapia" 
  | "catfish" 
  | "carp" 
  | "salmon" 
  | "trout" 
  | "other";

// Main Livestock Interface
export interface ILivestock extends Document {
  farmId: IFarm["_id"];
  owner: IUser["_id"];
  
  // Basic Info
  name?: string; // Optional name/tag for individual animals
  tagId?: string; // Ear tag, leg band, or unique identifier
  species: LivestockSpecies;
  breed?: string;
  trackingType: TrackingType;
  
  // For batch tracking (poultry, fish)
  quantity?: number;
  batchId?: string;
  
  // For individual tracking
  gender?: LivestockGender;
  dateOfBirth?: Date;
  acquisitionDate: Date;
  acquisitionMethod: "birth" | "purchase" | "gift" | "other";
  acquisitionCost?: number; // amount paid if purchased
  cost?: number; // expected selling price / current value
  
  // Physical attributes
  weight?: number; // Current weight in kg
  weightHistory?: IWeightRecord[];
  color?: string;
  markings?: string;
  
  // Status
  status: LivestockStatus;
  healthStatus: HealthStatus;
  
  // For poultry/fish specifics
  poultryType?: PoultryType;
  fishType?: FishType;
  housingUnit?: string; // Pen, coop, pond identifier
  
  // Lineage (for breeding)
  sireId?: Types.ObjectId; // Father
  damId?: Types.ObjectId; // Mother
  offspring?: Types.ObjectId[];
  
  // Media
  imageUrls?: string[];
  
  // Notes
  notes?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

// Weight tracking record
export interface IWeightRecord {
  weight: number;
  unit: "kg" | "lbs";
  recordedAt: Date;
  notes?: string;
}

// Health record for vaccinations, treatments, illnesses
export interface ILivestockHealth extends Document {
  livestockId: ILivestock["_id"];
  farmId: IFarm["_id"];
  owner: IUser["_id"];
  
  recordType: "vaccination" | "treatment" | "illness" | "checkup" | "deworming";
  
  // For vaccinations
  vaccineName?: string;
  vaccineType?: string;
  dosage?: string;
  administeredBy?: string;
  nextDueDate?: Date;
  
  // For treatments/illnesses
  condition?: string;
  symptoms?: string[];
  diagnosis?: string;
  medications?: IMedication[];
  treatmentDuration?: number; // days
  
  // General
  recordDate: Date;
  notes?: string;
  cost?: number;
  attachments?: string[]; // Document URLs
  
  createdAt: Date;
  updatedAt: Date;
}

export interface IMedication {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  administeredBy?: string;
}

// AI Diagnosis for livestock health
export interface ILivestockDiagnosisChatMessage {
  role: "user" | "assistant";
  content: string;
  structured?: any;
  reasoning_details?: any;
  timestamp: Date;
}

export interface ILivestockDiagnosis extends Document {
  livestockId?: ILivestock["_id"]; // Optional - can diagnose without registered animal
  farmId: IFarm["_id"];
  userId: IUser["_id"];

  // Images submitted
  imageUrls: string[];
  species: LivestockSpecies;
  animalDescription?: string; // If not registered

  // For batch livestock: how many animals are affected
  affectedCount?: number;
  batchSize?: number;

  // AI Analysis Results
  diagnosis: string;
  confidence: number; // 0-100
  symptoms: string[];
  severity: "low" | "medium" | "high" | "critical";

  // Treatment
  treatment: string[];
  treatmentPlan: ITreatmentTask[];
  prevention: string[];

  // Additional AI insights
  urgency: "immediate" | "within_24h" | "within_week" | "monitoring";
  spreadRisk?: string;
  quarantineRecommended?: boolean;
  vetVisitRecommended?: boolean;
  estimatedRecoveryTime?: string;

  // Cost estimates
  estimatedTreatmentCost?: {
    min: number;
    max: number;
    currency: string;
  };

  // Status tracking (keep in sync with Models\LivestockHealth.ts)
  status: "processing" | "completed" | "detected" | "treating" | "treated" | "resolved" | "failed";
  aiModel: string;
  analyzedAt?: Date;

  // Optional enrichment fields stored by the schema
  possibleConditions?: { name: string; probability: number; description?: string }[];
  veterinaryRequired?: boolean;
  followUpDays?: number;
  additionalNotes?: string;

  // Chat messages for diagnosis follow-ups
  chatMessages?: ILivestockDiagnosisChatMessage[];

  createdAt: Date;
  updatedAt: Date;
}

export interface ITreatmentTask {
  task: string;
  timeframe: string;
  category: "Immediate" | "Medication" | "Nutrition" | "Isolation" | "Monitoring";
  priority: "critical" | "high" | "medium" | "low";
  isCompleted: boolean;
  estimatedCost?: string;
}

// =========================
// Livestock Health Check Reports
// =========================

export type LivestockHealthCheckStatus = "ok" | "warning" | "critical" | "unknown";

export interface ILivestockHealthCheckItem {
  key: string;
  title: string;
  status: LivestockHealthCheckStatus;
  score?: number;
  findings?: string[];
  recommendations?: string[];
  data?: Record<string, any>;
}

export interface ILivestockHealthCheckReport extends Document {
  livestockId: ILivestock["_id"];
  farmId: IFarm["_id"];
  owner: IUser["_id"];

  generatedAt: Date;
  reason?: string;

  overallStatus: LivestockHealthCheckStatus;
  checks: ILivestockHealthCheckItem[];

  inputs?: {
    species?: LivestockSpecies;
    trackingType?: TrackingType;
    poultryType?: PoultryType;
    fishType?: FishType;
    dateOfBirth?: Date;
    acquisitionDate?: Date;
    weight?: number;
    quantity?: number;
    housingUnit?: string;
  };

  derived?: {
    ageDays?: number;
    ageWeeks?: number;
  };

  ai?: {
    used?: boolean;
    model?: string;
    enhancedAt?: Date;
    summary?: string;
    flags?: string[];
  };

  version: number;

  createdAt: Date;
  updatedAt: Date;
}

// Feeding records
export interface ILivestockFeeding extends Document {
  livestockId?: ILivestock["_id"]; // Can be null for batch feeding
  farmId: IFarm["_id"];
  owner: IUser["_id"];

  // What was fed
  feedType: string;
  feedBrand?: string;
  quantity: number;
  unit: "kg" | "lbs" | "bags" | "liters";

  // When
  feedingTime?: Date;
  intendedDurationDays?: number;
  scheduleType?: "morning" | "afternoon" | "evening" | "ad_libitum";

  // Cost tracking
  costPerUnit?: number;
  totalCost?: number;

  // For batch feeding
  batchId?: string;
  animalsCount?: number;

  notes?: string;

  createdAt: Date;
  updatedAt: Date;
}

// Feeding schedules (reminders)
export interface ILivestockFeedingSchedule extends Document {
  livestockId?: ILivestock["_id"]; // Optional (schedule can be for all animals)
  farmId: IFarm["_id"];
  owner: IUser["_id"];

  // When to remind (local to timezone)
  timesOfDay: string[]; // ["07:00", "16:00"]
  daysOfWeek?: number[]; // 0 (Sun) .. 6 (Sat). If omitted => every day
  timezone: string; // IANA TZ e.g. "Africa/Lagos"

  // Optional context
  scheduleType?: "morning" | "afternoon" | "evening" | "ad_libitum";
  feedType?: string;
  feedBrand?: string;

  enabled: boolean;

  // De-dupe reminder spam: store last sent keys like "2026-04-09-07:00"
  lastReminderKeys?: string[];

  notes?: string;

  createdAt: Date;
  updatedAt: Date;
}

// Breeding records
export type BreedingFollowUpType =
  | 'confirm_pregnancy'
  | 'antenatal_check'
  | 'nutrition_check'
  | 'vaccination'
  | 'deworming'
  | 'prepare_birth'
  | 'monitor_labor'
  | 'postpartum_check';

export type BreedingFollowUpStatus = 'pending' | 'done' | 'skipped';

export interface IBreedingFollowUp {
  _id?: Types.ObjectId;
  title: string;
  type: BreedingFollowUpType;
  dueDate: Date;
  status: BreedingFollowUpStatus;
  completedAt?: Date;
  reminderSentAt?: Date;
  notes?: string;
}

export interface ILivestockBreeding extends Document {
  farmId: IFarm["_id"];
  owner: IUser["_id"];

  // Parents
  damId: ILivestock["_id"]; // Mother
  sireId?: ILivestock["_id"]; // Father (optional for AI)

  // Breeding event
  breedingDate: Date;
  breedingMethod: "natural" | "artificial_insemination";

  // Pregnancy tracking
  isPregnant?: boolean;
  expectedDueDate?: Date;
  gestationDays?: number;
  pregnancyConfirmedAt?: Date;

  // Follow-ups / antenatal checkups
  followUps?: IBreedingFollowUp[];

  // Birth outcome
  birthDate?: Date;
  offspringCount?: number;
  offspringIds?: Types.ObjectId[];
  birthComplications?: string;
  birthOutcome?: {
    numberOfOffspring?: number;
    maleCount?: number;
    femaleCount?: number;
    stillborn?: number;
    birthWeight?: number;
    notes?: string;
  };

  // Status
  status: "bred" | "confirmed_pregnant" | "delivered" | "failed" | "aborted";

  notes?: string;

  createdAt: Date;
  updatedAt: Date;
}

// Inventory transactions (purchases, sales, deaths, births)
export interface ILivestockInventory extends Document {
  farmId: IFarm["_id"];
  owner: IUser["_id"];
  livestockId?: ILivestock["_id"];
  
  transactionType: "purchase" | "sale" | "birth" | "death" | "gift_in" | "gift_out" | "transfer" | "transfer_in" | "transfer_out";
  
  // Animal details
  species: LivestockSpecies;
  quantity: number;
  
  // Financial
  unitPrice?: number;
  totalAmount?: number;
  currency?: string;
  
  // Transaction details
  transactionDate: Date;
  counterparty?: string; // Buyer/seller name
  
  // For deaths
  causeOfDeath?: string;
  
  // For births
  breedingRecordId?: Types.ObjectId;
  
  notes?: string;
  attachments?: string[]; // Receipts, documents
  
  createdAt: Date;
  updatedAt: Date;
}

// Vet Consultation (AI Chat)
export interface IVetConsultation extends Document {
  farmId: IFarm["_id"];
  userId: IUser["_id"];
  livestockId?: ILivestock["_id"];
  
  species: LivestockSpecies;
  animalName?: string;
  
  status: "active" | "resolved" | "archived";
  title?: string;
  summary?: string;
  
  messages: IVetMessage[];
  
  issueType?: "disease" | "injury" | "nutrition" | "breeding" | "behavior" | "general";
  severity?: "low" | "medium" | "high" | "critical";
  
  createdAt: Date;
  updatedAt: Date;
}

export interface IVetMessage {
  role: "user" | "assistant";
  content: string;
  imageUrls?: string[];
  structured?: any;
  reasoning_details?: any;
  timestamp: Date;
}

// ========================================
// SEPARATE HEALTH RECORD INTERFACES
// ========================================

// Vaccination Record
export interface ILivestockVaccination extends Document {
  livestockId: ILivestock["_id"];
  farmId: IFarm["_id"];
  vaccineName: string;
  vaccineType?: string;
  batchNumber?: string;
  manufacturer?: string;
  dosage: string;
  dateAdministered: Date;
  administeredBy?: IUser["_id"];
  veterinarianName?: string;
  nextDueDate?: Date;
  boosterRequired?: boolean;
  cost?: number;
  notes?: string;
  attachments?: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Treatment Record
export interface ILivestockTreatment extends Document {
  livestockId: ILivestock["_id"];
  farmId: IFarm["_id"];
  condition: string;
  diagnosisId?: ILivestockDiagnosis["_id"];
  medications: {
    name: string;
    dosage: string;
    frequency: string;
    duration?: string;
    route?: "oral" | "injection" | "topical" | "other";
  }[];
  startDate: Date;
  endDate?: Date;
  administeredBy?: IUser["_id"];
  veterinarianName?: string;
  status: "ongoing" | "completed" | "discontinued";
  outcome?: string;
  cost?: number;
  notes?: string;
  attachments?: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Illness Record
export interface ILivestockIllness extends Document {
  livestockId: ILivestock["_id"];
  farmId: IFarm["_id"];
  condition: string;
  symptoms: string[];
  dateIdentified: Date;
  reportedBy?: IUser["_id"];
  severity: "mild" | "moderate" | "severe" | "critical";
  status: "active" | "under_treatment" | "resolved" | "chronic";
  resolvedDate?: Date;
  diagnosisId?: ILivestockDiagnosis["_id"];
  treatmentId?: ILivestockTreatment["_id"];
  notes?: string;
  attachments?: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Checkup Record
export interface ILivestockCheckup extends Document {
  livestockId: ILivestock["_id"];
  farmId: IFarm["_id"];
  checkupDate: Date;
  checkupType: "routine" | "pre_breeding" | "post_breeding" | "health_issue" | "regulatory";
  performedBy?: IUser["_id"];
  veterinarianName?: string;
  
  // Vital signs
  weight?: number;
  temperature?: number;
  heartRate?: number;
  respiratoryRate?: number;
  bodyConditionScore?: number; // 1-9
  
  // Results
  overallHealth: "excellent" | "good" | "fair" | "poor";
  findings: string[];
  recommendations: string[];
  followUpRequired?: boolean;
  followUpDate?: Date;
  
  cost?: number;
  notes?: string;
  attachments?: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Deworming Record
export interface ILivestockDeworming extends Document {
  livestockId: ILivestock["_id"];
  farmId: IFarm["_id"];
  productName: string;
  activeIngredient?: string;
  dosage: string;
  dateAdministered: Date;
  administeredBy?: IUser["_id"];
  nextDueDate?: Date;
  targetParasites?: string[];
  cost?: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
