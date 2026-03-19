import  mongoose, { Schema } from "mongoose";
import { IPractices } from "../Types/farm.practices.types";

const FarmPracticeSchema = new Schema<IPractices>({
  name: { type: String, required: true },
  description: { type: String, required: true },
  category: { 
    type: String, 
    enum: ["soil", "crop", "water", "agroforestry"], 
    required: true 
  },
  isActive: { type: Boolean, default: true },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

const FarmPractice = mongoose.model<IPractices>("FarmPractice", FarmPracticeSchema);

export default FarmPractice;
