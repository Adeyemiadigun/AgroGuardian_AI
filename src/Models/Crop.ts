import mongoose, { Schema } from "mongoose";
import { ICrop } from "../Types/farm.practices.types";

const CropSchema = new Schema<ICrop>({
  farmId: { type: mongoose.Schema.Types.ObjectId, ref: "Farm", required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name: { type: String, required: true },
  category: {
    type: String,
    enum: ["cereal", "legume", "tuber", "vegetable", "fruit", "beverage", "oil", "fiber", "spice", "latex", "forage"],
    required: true,
  },
  carbonMultiplier: { type: Number, required: true, default: 1.0 },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

const Crop = mongoose.model<ICrop>("Crop", CropSchema);

export default Crop;
