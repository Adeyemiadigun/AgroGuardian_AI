import { Document } from "mongoose";
import { IFarm } from "./farm.types";
import { IUser } from "./auth.types";

export interface ICropDiagnosis extends Document {
    farmId: IFarm["_id"];
    userId: IUser["_id"];
    imageUrls: string[];
    cropType: string;
    diagnosis: string;
    confidence: number;
    symptoms: string[];
    treatment: string[];
    treatmentPlan?: {
        task: string;
        timeframe: string;
        isCompleted: boolean;
    }[];
    prevention: string[];
    severity: "low" | "medium" | "high" | "critical";
    status: "processing" | "detected" | "treating" | "resolved";
    aiModel: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface IChatMessage {
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
}

export interface IDiagnosisChat extends Document {
    diagnosisId: ICropDiagnosis["_id"];
    userId: IUser["_id"];
    messages: IChatMessage[];
    createdAt: Date;
    updatedAt: Date;
}