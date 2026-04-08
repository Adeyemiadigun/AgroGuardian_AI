import mongoose, { Schema } from "mongoose";
import { ILivestockFeeding, ILivestockBreeding, ILivestockInventory, IVetConsultation } from "../Types/livestock.types";

// Feeding Records Schema
const livestockFeedingSchema = new Schema<ILivestockFeeding>(
  {
    livestockId: { type: Schema.Types.ObjectId, ref: "Livestock" },
    farmId: { type: Schema.Types.ObjectId, ref: "Farm", required: true },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },

    // Feed details
    feedType: { type: String, required: true },
    feedBrand: { type: String },
    quantity: { type: Number, required: true },
    unit: {
      type: String,
      enum: ["kg", "lbs", "bags", "liters"],
      default: "kg"
    },

    // Timing
    feedingTime: { type: Date, required: true },
    scheduleType: {
      type: String,
      enum: ["morning", "afternoon", "evening", "ad_libitum"]
    },

    // Cost
    costPerUnit: { type: Number },
    totalCost: { type: Number },

    // Batch feeding
    batchId: { type: String },
    animalsCount: { type: Number },

    notes: { type: String }
  },
  {
    timestamps: true
  }
);

livestockFeedingSchema.index({ farmId: 1, owner: 1 });
livestockFeedingSchema.index({ livestockId: 1 });
livestockFeedingSchema.index({ feedingTime: -1 });

export const LivestockFeeding = mongoose.model<ILivestockFeeding>("LivestockFeeding", livestockFeedingSchema);

// Breeding Records Schema
const livestockBreedingSchema = new Schema<ILivestockBreeding>(
  {
    farmId: { type: Schema.Types.ObjectId, ref: "Farm", required: true },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },

    // Parents
    damId: { type: Schema.Types.ObjectId, ref: "Livestock", required: true },
    sireId: { type: Schema.Types.ObjectId, ref: "Livestock" },

    // Breeding event
    breedingDate: { type: Date, required: true },
    breedingMethod: {
      type: String,
      enum: ["natural", "artificial_insemination"],
      default: "natural"
    },

    // Pregnancy
    isPregnant: { type: Boolean },
    expectedDueDate: { type: Date },
    gestationDays: { type: Number },

    // Birth outcome
    birthDate: { type: Date },
    offspringCount: { type: Number },
    offspringIds: [{ type: Schema.Types.ObjectId, ref: "Livestock" }],
    birthComplications: { type: String },

    // Status
    status: {
      type: String,
      enum: ["bred", "confirmed_pregnant", "delivered", "failed", "aborted"],
      default: "bred"
    },

    notes: { type: String }
  },
  {
    timestamps: true
  }
);

livestockBreedingSchema.index({ farmId: 1, owner: 1 });
livestockBreedingSchema.index({ damId: 1 });
livestockBreedingSchema.index({ expectedDueDate: 1 });
livestockBreedingSchema.index({ status: 1 });

export const LivestockBreeding = mongoose.model<ILivestockBreeding>("LivestockBreeding", livestockBreedingSchema);

// Inventory Transactions Schema
const livestockInventorySchema = new Schema<ILivestockInventory>(
  {
    farmId: { type: Schema.Types.ObjectId, ref: "Farm", required: true },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    livestockId: { type: Schema.Types.ObjectId, ref: "Livestock" },

    transactionType: {
      type: String,
      enum: ["purchase", "sale", "birth", "death", "gift_in", "gift_out", "transfer"],
      required: true
    },

    // Animal details
    species: {
      type: String,
      enum: ["cattle", "goat", "sheep", "rabbit", "pig", "poultry", "fish"],
      required: true
    },
    quantity: { type: Number, required: true, min: 1 },

    // Financial
    unitPrice: { type: Number },
    totalAmount: { type: Number },
    currency: { type: String, default: "NGN" },

    // Transaction details
    transactionDate: { type: Date, required: true },
    counterparty: { type: String },

    // Death details
    causeOfDeath: { type: String },

    // Birth reference
    breedingRecordId: { type: Schema.Types.ObjectId, ref: "LivestockBreeding" },

    notes: { type: String },
    attachments: [{ type: String }]
  },
  {
    timestamps: true
  }
);

livestockInventorySchema.index({ farmId: 1, owner: 1 });
livestockInventorySchema.index({ transactionType: 1 });
livestockInventorySchema.index({ transactionDate: -1 });
livestockInventorySchema.index({ species: 1 });

export const LivestockInventory = mongoose.model<ILivestockInventory>("LivestockInventory", livestockInventorySchema);

// Vet Consultation Message Schema
const vetMessageSchema = new Schema({
  role: { type: String, enum: ["user", "assistant"], required: true },
  content: { type: String, required: true },
  imageUrls: [{ type: String }],
  timestamp: { type: Date, default: Date.now }
}, { _id: true });

// Vet Consultation Schema
const vetConsultationSchema = new Schema<IVetConsultation>(
  {
    farmId: { type: Schema.Types.ObjectId, ref: "Farm", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    livestockId: { type: Schema.Types.ObjectId, ref: "Livestock" },

    species: {
      type: String,
      enum: ["cattle", "goat", "sheep", "rabbit", "pig", "poultry", "fish"],
      required: true
    },
    animalName: { type: String },

    status: {
      type: String,
      enum: ["active", "resolved", "archived"],
      default: "active"
    },
    title: { type: String },
    summary: { type: String },

    messages: [vetMessageSchema],

    issueType: {
      type: String,
      enum: ["disease", "injury", "nutrition", "breeding", "behavior", "general"]
    },
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"]
    }
  },
  {
    timestamps: true
  }
);

vetConsultationSchema.index({ farmId: 1, userId: 1 });
vetConsultationSchema.index({ userId: 1, status: 1 });
vetConsultationSchema.index({ createdAt: -1 });

export const VetConsultation = mongoose.model<IVetConsultation>("VetConsultation", vetConsultationSchema);
