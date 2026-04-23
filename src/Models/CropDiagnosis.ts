import mongoose, {Schema} from "mongoose";
import { ICropDiagnosis } from "../Types/diagnosis.types";

const cropDiagnosisSchema = new Schema<ICropDiagnosis>({
    farmId: { type: Schema.Types.ObjectId, ref: "Farm", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    imageUrls: [{ type: String, required: true }],
    cropType: { type: String, required: true },
    diagnosis: { type: String, required: true },
    confidence: { type: Number, required: true , min: 0, max: 100 },
    symptoms: [{ type: String }],
    treatment: [{ type: String }],
    prevention: [{ type: String }],
    severity: { type: String, enum: ["low", "medium", "high", "critical"], required: true },
    status: { type: String, enum: ["processing", "detected", "treating", "resolved", "failed"], default: "processing" },
    treatmentPlan: [
      {
        task: { type: String },
        timeframe: { type: String },
        isCompleted: { type: Boolean, default: false },
        category: { type: String, enum: ["Cultural", "Biological", "Chemical"] },
        estimatedCost: { type: String },
        priority: { type: String, enum: ["critical", "high", "medium", "low"] }
      }
    ],
    aiModel: { type: String, required: true },
    // New enhanced fields
    imageQuality: { type: String, enum: ["good", "fair", "poor"] },
    imageQualityIssues: [{ type: String }],
    affectedArea: { type: String },
    spreadRisk: { type: String, enum: ["low", "medium", "high"] },
    spreadRiskReason: { type: String },
    urgency: { type: String, enum: ["immediate", "within_24h", "within_week", "monitoring"] },
    totalEstimatedCost: {
      min: { type: Number },
      max: { type: Number },
      currency: { type: String, default: "NGN" },
      notes: { type: String }
    },
    yieldImpact: {
      withoutTreatment: { type: String },
      withTreatment: { type: String },
      economicBenefit: { type: String }
    },
    weatherConsiderations: {
      optimalSprayConditions: { type: String },
      rainWarning: { type: String },
      temperatureRange: { type: String }
    },
    similarCases: { type: String },
    localRemedies: [{ type: String }],
    lowConfidenceWarning: { type: String },
    criticalWarning: { type: String }
},{
    timestamps: true
})
cropDiagnosisSchema.index({ farmId: 1, userId: 1 })

export default mongoose.model<ICropDiagnosis>("CropDiagnosis", cropDiagnosisSchema)