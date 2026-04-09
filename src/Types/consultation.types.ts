import { Document } from "mongoose";
import { IFarm } from "./farm.types";
import { IUser } from "./auth.types";

export interface IConsultationMessage {
    role: "user" | "assistant";
    content: string;
    imageUrls?: string[];
    reasoning_details?: any;
    timestamp: Date;
}

export interface IConsultation extends Document {
    farmId: IFarm["_id"];
    userId: IUser["_id"];
    cropId?: string;
    cropName: string;
    seasonId?: string;
    status: "active" | "resolved" | "archived";
    title?: string;
    summary?: string;
    messages: IConsultationMessage[];
    issueType?: "disease" | "pest" | "nutrient" | "weather" | "general";
    severity?: "low" | "medium" | "high" | "critical";
    createdAt: Date;
    updatedAt: Date;
}
