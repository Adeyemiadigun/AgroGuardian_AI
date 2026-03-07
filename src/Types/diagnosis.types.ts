import { Document } from "mongoose";
import { IFarm } from "./farm.types";
import { IUser } from "./auth.types";

export interface ICropDiagnosis extends Document {
    farmId: IFarm["_id"];
    userId: IUser["_id"];
    imageUrl: string;
    cropType: string;
    diagnosis: string;
    confidence: number;
    symptoms: string[];
    treatment: string[];
    prevention: string[];
    severity: "low" | "medium" | "high" | "critical";
    status: "detected" | "treating" | "resolved";
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