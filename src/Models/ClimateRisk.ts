import mongoose, { Schema } from "mongoose";
import { IClimateRisk } from "../Types/weather.types";

// Sub-schema for risk details
const RiskDetailsSchema = new Schema({
    score: { type: Number },
    factors: [{ type: String }],
}, { _id: false });

const ClimateRiskSchema = new Schema({
    farmId: { type: Schema.Types.ObjectId, ref: "Farm", required: true },
    timestamp: { type: Date, required: true },
    droughtRisk: { type: String, enum: ['low', 'medium', 'high'], required: true },
    floodRisk: { type: String, enum: ['low', 'medium', 'high'], required: true },
    heatRisk: { type: String, enum: ['low', 'medium', 'high'], required: true },
    pestRisk: { type: String, enum: ['low', 'medium', 'high'], required: true },
    diseaseRisk: { type: String, enum: ['low', 'medium', 'high'], required: true },
    notes: { type: String },
    // Enhanced risk details
    droughtRiskDetails: RiskDetailsSchema,
    floodRiskDetails: RiskDetailsSchema,
    heatRiskDetails: RiskDetailsSchema,
    pestRiskDetails: RiskDetailsSchema,
    diseaseRiskDetails: RiskDetailsSchema,
});

export default mongoose.model<IClimateRisk>("ClimateRisk", ClimateRiskSchema);