import mongoose, { Schema } from "mongoose";
import { IConsultation } from "../Types/consultation.types";

const consultationMessageSchema = new Schema({
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true },
    imageUrls: [{ type: String }],
    timestamp: { type: Date, default: Date.now }
}, { _id: true });

const consultationSchema = new Schema<IConsultation>({
    farmId: { type: Schema.Types.ObjectId, ref: "Farm", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    cropId: { type: String },
    cropName: { type: String, required: true },
    seasonId: { type: String },
    status: { 
        type: String, 
        enum: ["active", "resolved", "archived"], 
        default: "active" 
    },
    title: { type: String },
    summary: { type: String },
    messages: [consultationMessageSchema],
    issueType: { 
        type: String, 
        enum: ["disease", "pest", "nutrient", "weather", "general"]
    },
    severity: { 
        type: String, 
        enum: ["low", "medium", "high", "critical"]
    }
}, {
    timestamps: true
});

consultationSchema.index({ farmId: 1, userId: 1 });
consultationSchema.index({ userId: 1, status: 1 });
consultationSchema.index({ createdAt: -1 });

export default mongoose.model<IConsultation>("Consultation", consultationSchema);
