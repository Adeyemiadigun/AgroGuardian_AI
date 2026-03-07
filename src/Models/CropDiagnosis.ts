import mongoose, {Schema} from "mongoose";
import { ICropDiagnosis } from "../Types/diagnosis.types";

const cropDiagnosisSchema = new Schema<ICropDiagnosis>({
    farmId: { type: Schema.Types.ObjectId, ref: "Farm", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    imageUrl: { type: String, required: true },
    cropType: { type: String, required: true },
    diagnosis: { type: String, required: true },
    confidence: { type: Number, required: true , min: 0, max: 100 },
    symptoms: [{ type: String }],
    treatment: [{ type: String }],
    prevention: [{ type: String }],
    severity: { type: String, enum: ["low", "medium", "high", "critical"], required: true },
    status: { type: String, enum: ["detected", "treating", "resolved"], default: "detected" },
    aiModel: { type: String, required: true }
},{
    timestamps: true
})
cropDiagnosisSchema.index({ farmId: 1, userId: 1 })

export default mongoose.model<ICropDiagnosis>("CropDiagnosis", cropDiagnosisSchema)