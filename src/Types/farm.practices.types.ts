import { Document } from "mongoose";
import { IFarm } from "./farm.types";

export interface IPractices extends Document {
  name: string;
  description: string;
  lastApplied: Date;
}

export interface IPracticeActivityLogs extends Document {
  farmId: IFarm["_id"];
  practiceId: IPractices["_id"];
  startDate: Date;
  endDate: Date;
  appliedOn: Date;
  size: number;
  sizeUnit: "acres" | "hectares";
  notes: string;
  status: string;
}

export interface ICarbonFactors extends Document {
  practiceId: IPractices["_id"];
  carbonFactorPerHectarePerYear : number;
}
export interface ICarbonCalculations extends Document {
  farmId: IFarm["_id"];
  practiceLogId: IPracticeActivityLogs["_id"];
  CarbonSequestered : number;
  CalculationDate: Date;
}

export interface ICarbonCredit extends Document {
  farmId: IFarm["_id"];
  creditsEarned : number;
  status :string;
  issuedDate: Date;

}

