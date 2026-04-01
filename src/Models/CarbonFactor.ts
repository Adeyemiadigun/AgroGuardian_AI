import mongoose, { Schema } from "mongoose";
import { ICarbonFactors } from "../Types/farm.practices.types";

const CarbonFactorsSchema = new Schema<ICarbonFactors>({
  practiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "FarmPractice",
    required: true,
  },
  cropId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Crop",
    required: true, // Required as per feedback
  },
  soilType: { 
    type: String, 
    enum: ["clay", "sandy", "loamy", "silty", "peaty", "laterite", "clay-loam", "sandy-loam"],
    required: true 
  },
  carbonFactorPerHectarePerYear: { type: Number, required: true },
  climateZone : {
    type: String,
    enum: ["tropical", "arid", "temperate", "continental", "polar"],
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

const CarbonFactor = mongoose.model<ICarbonFactors>("CarbonFactor", CarbonFactorsSchema);

export default CarbonFactor;
