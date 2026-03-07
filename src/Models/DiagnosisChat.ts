import mongoose, {Schema} from "mongoose";
import { IDiagnosisChat, IChatMessage } from "../Types/diagnosis.types";

const chatMessageSchema = new Schema<IDiagnosisChat>({
    diagnosisId: { type: Schema.Types.ObjectId, ref: "CropDiagnosis", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    messages: [{
        role: { type: String, enum: ["user", "assistant"], required: true },
        content: { type: String, required: true },
        timestamp: { type: Date, default: Date.now }
    }],
},{
    timestamps: true
})

chatMessageSchema.index({ diagnosisId: 1});

export default mongoose.model<IDiagnosisChat>("DiagnosisChat", chatMessageSchema);