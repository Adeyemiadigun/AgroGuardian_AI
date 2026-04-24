import mongoose, { Schema } from "mongoose";
import { ILivestockHealth, ILivestockDiagnosis } from "../Types/livestock.types";

// Medication subdocument schema
const medicationSchema = new Schema({
  name: { type: String, required: true },
  dosage: { type: String, required: true },
  frequency: { type: String, required: true },
  duration: { type: String },
  administeredBy: { type: String }
}, { _id: false });

// Health Records Schema
const livestockHealthSchema = new Schema<ILivestockHealth>(
  {
    livestockId: { type: Schema.Types.ObjectId, ref: "Livestock", required: true },
    farmId: { type: Schema.Types.ObjectId, ref: "Farm", required: true },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },

    recordType: {
      type: String,
      enum: ["vaccination", "treatment", "illness", "checkup", "deworming"],
      required: true
    },

    // Vaccination fields
    vaccineName: { type: String },
    vaccineType: { type: String },
    dosage: { type: String },
    administeredBy: { type: String },
    nextDueDate: { type: Date },

    // Treatment/Illness fields
    condition: { type: String },
    symptoms: [{ type: String }],
    diagnosis: { type: String },
    medications: [medicationSchema],
    treatmentDuration: { type: Number },

    // General fields
    recordDate: { type: Date, required: true },
    notes: { type: String },
    cost: { type: Number },
    attachments: [{ type: String }]
  },
  {
    timestamps: true
  }
);

livestockHealthSchema.index({ livestockId: 1, recordType: 1 });
livestockHealthSchema.index({ farmId: 1, owner: 1 });
livestockHealthSchema.index({ nextDueDate: 1 }); // For vaccination reminders

export const LivestockHealth = mongoose.model<ILivestockHealth>("LivestockHealth", livestockHealthSchema);

// Treatment task subdocument for diagnosis
const treatmentTaskSchema = new Schema({
  task: { type: String, required: true },
  timeframe: { type: String, required: true },
  category: {
    type: String,
    enum: ["Immediate", "Medication", "Nutrition", "Isolation", "Monitoring"]
  },
  priority: {
    type: String,
    enum: ["critical", "high", "medium", "low"]
  },
  isCompleted: { type: Boolean, default: false },
  estimatedCost: { type: String }
}, { _id: true });

// AI Diagnosis Schema
const livestockDiagnosisSchema = new Schema<ILivestockDiagnosis>(
  {
    livestockId: { type: Schema.Types.ObjectId, ref: "Livestock" },
    farmId: { type: Schema.Types.ObjectId, ref: "Farm", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    // Images
    imageUrls: [{ type: String, required: true }],
    species: {
      type: String,
      enum: ["cattle", "goat", "sheep", "pig", "poultry", "fish", "rabbit"],
      required: true
    },
    animalDescription: { type: String },
    
    // For batch livestock: how many animals in the batch are affected
    affectedCount: { type: Number, min: 1 },
    batchSize: { type: Number, min: 1 },

    // AI Analysis
    diagnosis: { type: String, required: true },
    confidence: { type: Number, required: true, min: 0, max: 100 },
    symptoms: [{ type: String }],
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      required: true
    },

    // Treatment
    treatment: [{ type: String }],
    treatmentPlan: [treatmentTaskSchema],
    prevention: [{ type: String }],

    // Additional insights
    urgency: {
      type: String,
      enum: ["immediate", "within_24h", "within_week", "monitoring"]
    },
    spreadRisk: { type: String },
    quarantineRecommended: { type: Boolean },
    vetVisitRecommended: { type: Boolean },
    estimatedRecoveryTime: { type: String },

    // Cost estimates
    estimatedTreatmentCost: {
      min: { type: Number },
      max: { type: Number },
      currency: { type: String, default: "NGN" }
    },

    // Status
    status: {
      type: String,
      enum: ["processing", "completed", "detected", "treating", "treated", "resolved", "failed"],
      default: "processing"
    },
    aiModel: { type: String, required: true },
    analyzedAt: { type: Date },
    
    // Possible conditions
    possibleConditions: [{
      name: { type: String },
      probability: { type: Number },
      description: { type: String }
    }],

    // Follow up
    veterinaryRequired: { type: Boolean },
    followUpDays: { type: Number },
    additionalNotes: { type: String },

    // Chat messages for diagnosis consultation
    chatMessages: [{
      role: { type: String, enum: ["user", "assistant"], required: true },
      content: { type: String, required: true },
      structured: { type: Schema.Types.Mixed },
      reasoning_details: { type: Schema.Types.Mixed },
      timestamp: { type: Date, default: Date.now }
    }]
  },
  {
    timestamps: true
  }
);

livestockDiagnosisSchema.index({ farmId: 1, userId: 1 });
livestockDiagnosisSchema.index({ livestockId: 1 });
livestockDiagnosisSchema.index({ status: 1 });

export const LivestockDiagnosis = mongoose.model<ILivestockDiagnosis>("LivestockDiagnosis", livestockDiagnosisSchema);

// =========================
// SEPARATE HEALTH RECORD MODELS
// =========================

// Vaccination Schema
const vaccinationSchema = new Schema({
  livestockId: { type: Schema.Types.ObjectId, ref: "Livestock", required: true },
  farmId: { type: Schema.Types.ObjectId, ref: "Farm", required: true },
  vaccineName: { type: String, required: true },
  vaccineType: { type: String },
  batchNumber: { type: String },
  manufacturer: { type: String },
  dosage: { type: String, required: true },
  dateAdministered: { type: Date, required: true },
  administeredBy: { type: Schema.Types.ObjectId, ref: "User" },
  veterinarianName: { type: String },
  nextDueDate: { type: Date },
  boosterRequired: { type: Boolean, default: false },

  // Reminder dedupe (prevents repeated emails/notifications for the same due date)
  lastReminderKey: { type: String },
  lastReminderSentAt: { type: Date },

  cost: { type: Number },
  notes: { type: String },
  attachments: [{ type: String }]
}, { timestamps: true });

vaccinationSchema.index({ livestockId: 1, dateAdministered: -1 });
vaccinationSchema.index({ farmId: 1, nextDueDate: 1 });

export const LivestockVaccination = mongoose.model("LivestockVaccination", vaccinationSchema);

// Treatment Schema
const treatmentSchema = new Schema({
  livestockId: { type: Schema.Types.ObjectId, ref: "Livestock", required: true },
  farmId: { type: Schema.Types.ObjectId, ref: "Farm", required: true },
  condition: { type: String, required: true },
  diagnosisId: { type: Schema.Types.ObjectId, ref: "LivestockDiagnosis" },
  medications: [{
    name: { type: String, required: true },
    dosage: { type: String, required: true },
    frequency: { type: String, required: true },
    duration: { type: String },
    route: { type: String, enum: ["oral", "injection", "topical", "other"] }
  }],
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  administeredBy: { type: Schema.Types.ObjectId, ref: "User" },
  veterinarianName: { type: String },
  status: { 
    type: String, 
    enum: ["ongoing", "completed", "discontinued"], 
    default: "ongoing" 
  },
  outcome: { type: String },
  cost: { type: Number },
  notes: { type: String },
  attachments: [{ type: String }]
}, { timestamps: true });

treatmentSchema.index({ livestockId: 1, status: 1 });
treatmentSchema.index({ farmId: 1, status: 1 });

export const LivestockTreatment = mongoose.model("LivestockTreatment", treatmentSchema);

// Illness Schema
const illnessSchema = new Schema({
  livestockId: { type: Schema.Types.ObjectId, ref: "Livestock", required: true },
  farmId: { type: Schema.Types.ObjectId, ref: "Farm", required: true },
  condition: { type: String, required: true },
  description: { type: String }, // Detailed description of the illness
  symptoms: [{ type: String }],
  dateIdentified: { type: Date, required: true },
  reportedBy: { type: Schema.Types.ObjectId, ref: "User" },
  severity: { 
    type: String, 
    enum: ["mild", "moderate", "severe", "critical"], 
    required: true 
  },
  status: { 
    type: String, 
    enum: ["active", "under_treatment", "resolved", "chronic"], 
    default: "active" 
  },
  // For batch livestock: how many animals in the batch are affected
  affectedCount: { type: Number, min: 1 },
  resolvedDate: { type: Date },
  diagnosisId: { type: Schema.Types.ObjectId, ref: "LivestockDiagnosis" },
  treatmentId: { type: Schema.Types.ObjectId, ref: "LivestockTreatment" },
  notes: { type: String },
  // Image URLs for visual documentation of the illness
  imageUrls: [{ type: String }],
  attachments: [{ type: String }]
}, { timestamps: true });

illnessSchema.index({ livestockId: 1, status: 1 });
illnessSchema.index({ farmId: 1, status: 1 });

export const LivestockIllness = mongoose.model("LivestockIllness", illnessSchema);

// Checkup Schema
const checkupSchema = new Schema({
  livestockId: { type: Schema.Types.ObjectId, ref: "Livestock", required: true },
  farmId: { type: Schema.Types.ObjectId, ref: "Farm", required: true },
  checkupDate: { type: Date, required: true },
  checkupType: { 
    type: String, 
    enum: ["routine", "pre_breeding", "post_breeding", "health_issue", "regulatory"],
    required: true 
  },
  performedBy: { type: Schema.Types.ObjectId, ref: "User" },
  veterinarianName: { type: String },
  
  // Vital signs
  weight: { type: Number },
  temperature: { type: Number },
  heartRate: { type: Number },
  respiratoryRate: { type: Number },
  bodyConditionScore: { type: Number, min: 1, max: 9 },
  
  // Examination results
  overallHealth: { 
    type: String, 
    enum: ["excellent", "good", "fair", "poor"], 
    required: true 
  },
  findings: [{ type: String }],
  recommendations: [{ type: String }],
  followUpRequired: { type: Boolean, default: false },
  followUpDate: { type: Date },
  
  cost: { type: Number },
  notes: { type: String },
  attachments: [{ type: String }]
}, { timestamps: true });

checkupSchema.index({ livestockId: 1, checkupDate: -1 });
checkupSchema.index({ farmId: 1, checkupDate: -1 });

export const LivestockCheckup = mongoose.model("LivestockCheckup", checkupSchema);

// Deworming Schema
const dewormingSchema = new Schema({
  livestockId: { type: Schema.Types.ObjectId, ref: "Livestock", required: true },
  farmId: { type: Schema.Types.ObjectId, ref: "Farm", required: true },
  productName: { type: String, required: true },
  activeIngredient: { type: String },
  dosage: { type: String, required: true },
  dateAdministered: { type: Date, required: true },
  administeredBy: { type: Schema.Types.ObjectId, ref: "User" },
  nextDueDate: { type: Date },

  // Reminder dedupe (prevents repeated emails/notifications for the same due date)
  lastReminderKey: { type: String },
  lastReminderSentAt: { type: Date },

  targetParasites: [{ type: String }],
  cost: { type: Number },
  notes: { type: String }
}, { timestamps: true });

dewormingSchema.index({ livestockId: 1, dateAdministered: -1 });
dewormingSchema.index({ farmId: 1, nextDueDate: 1 });

export const LivestockDeworming = mongoose.model("LivestockDeworming", dewormingSchema);
