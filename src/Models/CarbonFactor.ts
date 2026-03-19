import mongoose, { Schema } from "mongoose";

import { ICarbonFactors } from "../Types/farm.practices.types";

// export interface ICarbonFactors extends Document {
//   practiceId: IPractices["_id"];
//   cropId: ICrop["_id"];
//   soilType: string;
//   carbonFactorPerHectarePerYear: number;
// }

const CarbonFactorsSchema = new Schema<ICarbonFactors>({
  practiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "FarmPractice",
    required: true,
  },
  cropId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Crop",
    required: true,
  },
  soilType: { type: String, required: true },
  carbonFactorPerHectarePerYear: { type: Number, required: true },
  climateZone : {
    type: String,
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
