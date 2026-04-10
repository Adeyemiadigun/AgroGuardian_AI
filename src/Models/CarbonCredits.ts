import mongoose, { Schema } from "mongoose";

import { ICarbonCredit } from "../Types/farm.practices.types";
// export interface ICarbonCredit extends Document {
//   farmId: IFarm["_id"];
//   creditsEarned: number;
//   status: "pending-verification" | "verified" | "issued" | "retired";
//   issuedDate: Date;
// }

const CarbonCreditsSchema = new Schema<ICarbonCredit>({
  farmId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Farm",
    required: true,
  },
  practiceLogId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PracticeActivityLogs",
    required: false,
  },
  monthKey: {
    type: String,
    required: false,
  },
  creditType: {
    type: String,
    enum: ["accrual", "final"],
    default: "final",
  },
  isEstimated: {
    type: Boolean,
    default: false,
  },
  creditsEarned: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ["pending-verification", "verified", "issued", "retired"],
    default: "pending-verification",
  },
  issuedDate: {
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
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false,
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

// Prevent duplicates for monthly accrual credits (legacy credits without practiceLogId/monthKey are unaffected)
CarbonCreditsSchema.index(
  { practiceLogId: 1, monthKey: 1, creditType: 1 },
  { unique: true, sparse: true }
);

const CarbonCredits = mongoose.model<ICarbonCredit>("CarbonCredits", CarbonCreditsSchema);

export default CarbonCredits;
