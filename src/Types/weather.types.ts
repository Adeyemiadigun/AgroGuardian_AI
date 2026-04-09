import { Document } from 'mongoose';
import { IFarm } from './farm.types';

export interface IWeatherData  extends Document {
  farmId: IFarm["_id"]; 
  timestamp: Date;
  provider: string; 
  location: {
    lat: number;
    lon: number;
    name?: string;
  };
  current: {
    temperature: number; 
    humidity: number; 
    windSpeed: number; 
    windDirection: number;
    precipitation: number; 
    weatherCode: number; 
    weatherDescription: string;
    icon?: string;
  };
  forecast?: Array<{
    timestamp: Date;
    temperature: number;
    humidity: number;
    precipitation: number;
    weatherCode: number;
    weatherDescription: string;
    icon?: string;
  }>;

  // Raw OpenWeather payloads (stored to enable full weather reporting in the UI)
  currentRaw?: any;
  forecastRaw?: any[];
}

export interface IClimateRisk extends Document {
  farmId: IFarm["_id"];
  timestamp: Date;
  droughtRisk: 'low' | 'medium' | 'high';
  floodRisk: 'low' | 'medium' | 'high';
  heatRisk: 'low' | 'medium' | 'high';
  pestRisk: 'low' | 'medium' | 'high';
  diseaseRisk: 'low' | 'medium' | 'high';
  notes?: string;
  // Enhanced risk details (optional)
  droughtRiskDetails?: {
    score: number;
    factors: string[];
  };
  floodRiskDetails?: {
    score: number;
    factors: string[];
  };
  heatRiskDetails?: {
    score: number;
    factors: string[];
  };
  pestRiskDetails?: {
    score: number;
    factors: string[];
  };
  diseaseRiskDetails?: {
    score: number;
    factors: string[];
  };
}

export interface IWeatherAlert  extends Document {
  farmId: IFarm["_id"];
  timestamp: Date;
  type: 'drought' | 'flood' | 'heat' | 'pest' | 'disease' | 'storm' | 'custom';
  level: 'info' | 'warning' | 'critical';
  message: string;
  acknowledged?: boolean;
}


export interface PlantingWindow {
  date: Date;
  score: number; 
  reason: string;
  isViable: boolean;
}