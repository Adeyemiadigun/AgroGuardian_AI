import mongoose, { Schema } from "mongoose";

import { ICrop } from "../Types/farm.practices.types";

// export interface ICrop extends Document {
//   name: string;
//   category: "cereal" | "legume" | "vegetable" | "tree";
//   carbonMultiplier: number;
// }

const CropSchema = new Schema<ICrop>({
  name: { type: String, required: true },
  category: {
    type: String,
    enum: ["cereal", "legume", "vegetable", "tree"],
    required: true,
  },
  carbonMultiplier: { type: Number, required: true },
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
