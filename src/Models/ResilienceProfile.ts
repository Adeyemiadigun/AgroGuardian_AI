import mongoose, { Schema } from "mongoose";
import { IResilienceProfile } from "../Types/resilience.types";

const ResilienceProfileSchema = new Schema<IResilienceProfile>(
  {
    farmId: { type: Schema.Types.ObjectId, ref: "Farm", required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    overallScore: { type: Number, default: 0, min: 0, max: 100 },
    metrics: {
      managementScore: { type: Number, default: 0 },
      climateAdaptationScore: { type: Number, default: 0 },
      diversityScore: { type: Number, default: 0 },
      sustainabilityScore: { type: Number, default: 0 },
    },
    history: [
      {
        score: { type: Number, required: true },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    recommendations: [{ type: String }],
  },
  {
    timestamps: true,
  }
);

ResilienceProfileSchema.index({ farmId: 1, userId: 1 });

export default mongoose.model<IResilienceProfile>("ResilienceProfile", ResilienceProfileSchema);
