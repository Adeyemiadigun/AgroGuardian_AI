import mongoose, {Schema} from "mongoose";

import { IPracticeActivityLogs } from "../Types/farm.practices.types"; 

const PracticeActivityLogsSchema = new Schema<IPracticeActivityLogs>({
  farmId: { type: mongoose.Schema.Types.ObjectId, ref: "Farm", required: true },
  practiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "FarmPractice",
    required: true,
  },
  cropSeasonId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "CropSeason",
    required: false,
  },
  cropId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Crop",
    required: true,
  },
  soilType: { 
    type: String, 
    enum: ["clay", "sandy", "loamy", "silty", "peaty", "laterite", "clay-loam", "sandy-loam"],
    required: true 
  },
  appliedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  size: {
    type: Number,
    required: true,
  },
  sizeUnit: { type: String, enum: ["acres", "hectares"], required: true },
  notes: {
    type: String,
    required: false,
  },
  status: {
    type: String,
    enum: ["active", "completed", "paused"],
    default: "active",
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

const PracticeActivityLogs = mongoose.model<IPracticeActivityLogs>("PracticeActivityLogs", PracticeActivityLogsSchema);

export default PracticeActivityLogs;
