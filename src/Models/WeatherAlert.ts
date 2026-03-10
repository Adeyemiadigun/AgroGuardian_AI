import mongoose, { Schema } from "mongoose";
import { IWeatherAlert } from "../Types/weather.types";


export const WeatherAlertSchema = new Schema<IWeatherAlert>({
    farmId: { type: Schema.Types.ObjectId, ref: "Farm", required: true },
    timestamp: { type: Date, required: true },
    type: { type: String, enum: ['drought', 'flood', 'heat', 'pest', 'disease', 'storm', 'custom'], required: true },
    level: { type: String, enum: ['info', 'warning', 'critical'], required: true },
    message: { type: String, required: true },
    acknowledged: { type: Boolean, default: false }
});

export default mongoose.model<IWeatherAlert>("WeatherAlert", WeatherAlertSchema);