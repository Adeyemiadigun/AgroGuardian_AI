import mongoose, { Schema } from "mongoose";

import { ICarbonCalculations } from "../Types/farm.practices.types";

// export interface ICarbonCalculations extends Document {
//   farmId: IFarm["_id"];
//   practiceLogId: IPracticeActivityLogs["_id"];
//   CarbonSequestered: number;
//   CalculationDate: Date;
//   periodStart: Date;
//   periodEnd: Date;
// }

const CarbonCalculationsSchema = new Schema<ICarbonCalculations>({
  farmId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Farm",
    required: true,
  },
  practiceLogId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PracticeActivityLogs",
    required: true,
  },
  CarbonSequestered: {
    type: Number,
    required: true,
  },
  CalculationDate: {
    type: Date,
    required: true,
  },
  periodStart: {
    type: Date,
    required: true,
  },
  periodEnd: {
    type: Date,
    required: true,
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

const CarbonCalculations = mongoose.model<ICarbonCalculations>("CarbonCalculations", CarbonCalculationsSchema);

export default CarbonCalculations;
