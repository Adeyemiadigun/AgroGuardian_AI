import mongoose, { Schema } from "mongoose";
import { IClimateRisk } from "../Types/weather.types";


const ClimateRiskSchema = new Schema<IClimateRisk>({
    farmId: { type: Schema.Types.ObjectId, ref: "Farm", required: true },
    timestamp: { type: Date, required: true },
    droughtRisk: { type: String, enum: ['low', 'medium', 'high'], required: true },
    floodRisk: { type: String, enum: ['low', 'medium', 'high'], required: true },
    heatRisk: { type: String, enum: ['low', 'medium', 'high'], required: true },
    pestRisk: { type: String, enum: ['low', 'medium', 'high'], required: true },
    diseaseRisk: { type: String, enum: ['low', 'medium', 'high'], required: true },
    notes: String,
});

export default mongoose.model<IClimateRisk>("ClimateRisk", ClimateRiskSchema);   