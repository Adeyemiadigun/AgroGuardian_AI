import { Document, Schema } from "mongoose";

export interface IResilienceMetrics {
  managementScore: number;
  climateAdaptationScore: number;
  diversityScore: number;
  sustainabilityScore: number;
}

export interface IScoreHistory {
  score: number;
  timestamp: Date;
}

export interface IResilienceProfile extends Document {
  farmId: Schema.Types.ObjectId;
  userId: Schema.Types.ObjectId;
  overallScore: number;
  metrics: IResilienceMetrics;
  history: IScoreHistory[];
  recommendations: string[];
  createdAt: Date;
  updatedAt: Date;
}
