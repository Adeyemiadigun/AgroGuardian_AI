import { Document } from "mongoose";
import { IFarm } from "./farm.types";

export interface IPractices extends Document {
  name: string;
  description: string;
}

export interface IPracticeActivityLogs extends Document {
  farmId: IFarm["_id"];
  practiceId: IPractices["_id"];
  cropSeasonId?: ICropSeason["_id"];
  cropId: ICrop["_id"]; // add this
  startDate: Date;
  endDate: Date;
  size: number;
  sizeUnit: "acres" | "hectares";
  notes: string;
  status: "active" | "completed" | "paused";
}

export interface ICarbonFactors extends Document {
  practiceId: IPractices["_id"];
  cropId: ICrop["_id"];
  soilType: string;
  carbonFactorPerHectarePerYear: number;
}
export interface ICarbonCalculations extends Document {
  farmId: IFarm["_id"];
  practiceLogId: IPracticeActivityLogs["_id"];
  CarbonSequestered: number;
  CalculationDate: Date;
  periodStart: Date;
  periodEnd: Date;
}

export interface ICarbonCredit extends Document {
  farmId: IFarm["_id"];
  creditsEarned: number;
  status: "pending-verification" | "verified" | "issued" | "retired";
  issuedDate: Date;
}
export interface ICrop extends Document {
  name: string;
  category: "cereal" | "legume" | "vegetable" | "tree";
  carbonMultiplier: number;
}
export interface ICropSeason extends Document {
  farmId: IFarm["_id"];
  cropId: ICrop["_id"];
  plantedDate: Date;
  harvestDate?: Date;
  area: number;
  areaUnit: "acres" | "hectares";
}
export interface IEvidence extends Document {
  farmId: IFarm["_id"];
  practiceLogId: IPracticeActivityLogs["_id"];
  imageUrl: string;
  description?: string;
  uploadedAt: Date;
}