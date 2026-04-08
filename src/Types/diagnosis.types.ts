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
        category?: "Cultural" | "Biological" | "Chemical";
        estimatedCost?: string;
        priority?: "critical" | "high" | "medium" | "low";
    }[];
    prevention: string[];
    severity: "low" | "medium" | "high" | "critical";
    status: "processing" | "detected" | "treating" | "resolved";
    aiModel: string;
    // Enhanced fields
    imageQuality?: "good" | "fair" | "poor";
    imageQualityIssues?: string[];
    affectedArea?: string;
    spreadRisk?: "low" | "medium" | "high";
    spreadRiskReason?: string;
    urgency?: "immediate" | "within_24h" | "within_week" | "monitoring";
    totalEstimatedCost?: {
        min: number;
        max: number;
        currency: string;
        notes?: string;
    };
    yieldImpact?: {
        withoutTreatment: string;
        withTreatment: string;
        economicBenefit?: string;
    };
    weatherConsiderations?: {
        optimalSprayConditions: string;
        rainWarning?: string;
        temperatureRange?: string;
    };
    similarCases?: string;
    localRemedies?: string[];
    lowConfidenceWarning?: string;
    criticalWarning?: string;
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