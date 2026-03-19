import mongoose, { Schema } from "mongoose";
import { ICropSeason } from "../Types/farm.practices.types";

const CropSeasonSchema = new Schema<ICropSeason>({
  farmId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Farm",
    required: true,
  },
  cropId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Crop",
    required: true,
  },
  plantedDate: {
    type: Date,
    required: true,
  },
  harvestDate: {
    type: Date,
  },
  area: {
    type: Number,
    required: true,
  },
  areaUnit: {
    type: String,
    enum: ["acres", "hectares"],
    required: true,
  },
  status: {
    type: String,
    enum: ["active", "harvested", "failed"],
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

const CropSeason = mongoose.model<ICropSeason>("CropSeason", CropSeasonSchema);

export default CropSeason;
