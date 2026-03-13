import { Document } from "mongoose";    
import { IUser } from "./auth.types";

export interface IFarm extends Document {
    owner: IUser["_id"]; 
    name: string;
    size: number; 
    sizeUnit: "acres" | "hectares";
    crops: string[]; 
    location: ILocation;
    imageUrl?: string[];
    description?: string;
    status: "active" | "inactive" | "fallow";
    irrigationType: "drip" | "sprinkler" | "flood" | "rainfed" | "none";
    soilType: "clay" | "sandy" | "loamy" | "silty" | "peaty" | "laterite" | "clay-loam"| "sandy-loam";
    climateZone: "tropical" | "arid" | "temperate" | "continental" | "polar";
    createdAt: Date;
    updatedAt: Date;
    establishedDate?: Date;
}

export interface ILocation {
    address: string;
    city: string;
    state: string;
    country: string;
    coordinates:{
        latitude: number;
        longitude: number;
    }
}