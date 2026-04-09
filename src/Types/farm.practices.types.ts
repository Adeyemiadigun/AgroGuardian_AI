import { Document } from "mongoose";
import { IFarm } from "./farm.types";
import { IUser } from "./auth.types";


export interface IPractices extends Document {
  name: string;
  description: string;
  category: "soil" | "crop" | "water" | "agroforestry";
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPracticeActivityLogs extends Document {
  farmId: IFarm["_id"];
  practiceId: IPractices["_id"];
  cropSeasonId?: ICropSeason["_id"];
  cropId: ICrop["_id"];
  soilType: "clay" | "sandy" | "loamy" | "silty" | "peaty" | "laterite" | "clay-loam"| "sandy-loam";
  startDate: Date;
  endDate: Date;
  size: number;
  sizeUnit: "acres" | "hectares";
  notes: string;
  status: "active" | "pending_start" | "pending_end" | "completed" | "failed";
  startEvidenceId?: IEvidence["_id"];
  endEvidenceId?: IEvidence["_id"];
  verificationFlags: string[];
  appliedBy: IUser["_id"];
  createdAt: Date;
  updatedAt: Date;
}

export interface ICarbonFactors extends Document {
  practiceId: IPractices["_id"];
  cropId: ICrop["_id"];
  soilType: string;
  climateZone: string;
  carbonFactorPerHectarePerYear: number;
  createdAt: Date;
  updatedAt: Date;
}
export interface ICarbonCalculations extends Document {
  farmId: IFarm["_id"];
  practiceLogId: IPracticeActivityLogs["_id"];
  CarbonSequestered: number;
  CalculationDate: Date;
  periodStart: Date;
  periodEnd: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICarbonCredit extends Document {
  farmId: IFarm["_id"];
  creditsEarned: number;
  status: "pending-verification" | "verified" | "issued" | "retired";
  periodStart: Date;
  periodEnd: Date;
  verifiedBy?: IUser["_id"];
  issuedDate: Date;
  createdAt: Date;
  updatedAt: Date;
}
export interface ICrop extends Document {
  farmId: IFarm["_id"];
  owner: IUser["_id"];
  name: string;
  category: "cereal" | "legume" | "tuber" | "vegetable" | "fruit" | "beverage" | "oil" | "fiber" | "spice" | "latex" | "forage";
  carbonMultiplier: number;
  createdAt: Date;
  updatedAt: Date;
}
export interface ICropSeason extends Document {
  farmId: IFarm["_id"];
  cropId: ICrop["_id"];
  plantedDate: Date;
  harvestDate?: Date;
  area: number;
  status: "active" | "harvested" | "failed";
  areaUnit: "acres" | "hectares";
  createdAt: Date;
  updatedAt: Date;
}
export interface IEvidence extends Document {
  farmId: IFarm["_id"];
  practiceLogId: IPracticeActivityLogs["_id"];
  imageUrl: string;
  description?: string;
  evidenceType: "start" | "end";
  exifData?: {
    latitude?: number;
    longitude?: number;
    takenAt?: Date;
    cameraModel?: string;
  };
  uploadedBy: IUser["_id"];
  uploadedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}