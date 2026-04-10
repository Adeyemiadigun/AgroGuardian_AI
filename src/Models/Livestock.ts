import mongoose, { Schema } from "mongoose";
import { ILivestock } from "../Types/livestock.types";

const weightRecordSchema = new Schema({
  weight: { type: Number, required: true },
  unit: { type: String, enum: ["kg", "lbs"], default: "kg" },
  recordedAt: { type: Date, default: Date.now },
  notes: { type: String }
}, { _id: true });

const livestockSchema = new Schema<ILivestock>(
  {
    farmId: { type: Schema.Types.ObjectId, ref: "Farm", required: true },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },

    // Basic Info
    name: { type: String, trim: true },
    tagId: { type: String, trim: true },
    species: {
      type: String,
      enum: ["cattle", "goat", "sheep", "pig", "poultry", "fish", "rabbit"],
      required: true
    },
    breed: { type: String, trim: true },
    trackingType: {
      type: String,
      enum: ["individual", "batch"],
      required: true
    },

    // For batch tracking
    quantity: { type: Number, min: 1 },
    batchId: { type: String, trim: true },

    // For individual tracking
    gender: { type: String, enum: ["male", "female", "unknown"] },
    dateOfBirth: { type: Date },
    acquisitionDate: { type: Date, required: true },
    acquisitionMethod: {
      type: String,
      enum: ["birth", "purchase", "gift", "other"],
      default: "purchase"
    },
    // Amount paid (only for purchase)
    acquisitionCost: { type: Number },
    // Farmer's expected selling price / current value
    cost: { type: Number },

    // Physical attributes
    weight: { type: Number },
    weightHistory: [weightRecordSchema],
    color: { type: String },
    markings: { type: String },

    // Status
    status: {
      type: String,
      enum: ["active", "sold", "deceased", "quarantined", "breeding"],
      default: "active"
    },
    healthStatus: {
      type: String,
      enum: ["healthy", "sick", "recovering", "under_treatment", "critical"],
      default: "healthy"
    },

    // Poultry/Fish specifics
    poultryType: {
      type: String,
      enum: [
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
        "quail"
      ]
    },
    fishType: {
      type: String,
      enum: ["tilapia", "catfish", "carp", "salmon", "trout", "other"]
    },
    housingUnit: { type: String },

    // Lineage
    sireId: { type: Schema.Types.ObjectId, ref: "Livestock" },
    damId: { type: Schema.Types.ObjectId, ref: "Livestock" },
    offspring: [{ type: Schema.Types.ObjectId, ref: "Livestock" }],

    // Media
    imageUrls: [{ type: String }],

    // Notes
    notes: { type: String }
  },
  {
    timestamps: true
  }
);

// Indexes for efficient queries
livestockSchema.index({ farmId: 1, owner: 1 });
livestockSchema.index({ farmId: 1, species: 1 });
livestockSchema.index({ farmId: 1, status: 1 });
livestockSchema.index({ tagId: 1, farmId: 1 });
livestockSchema.index({ batchId: 1, farmId: 1 });

export default mongoose.model<ILivestock>("Livestock", livestockSchema);
