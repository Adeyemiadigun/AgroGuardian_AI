import mongoose, { Schema } from "mongoose";
import { IWeatherData } from "../Types/weather.types";

const WeatherDataSchema = new Schema<IWeatherData>({
  farmId: { type: Schema.Types.ObjectId, ref: "Farm", required: true },
  timestamp: { type: Date, required: true },
  provider: { type: String, required: true },
  location: {
    lat: { type: Number, required: true },
    lon: { type: Number, required: true },
    name: String,
  },
  current: {
    temperature: Number,
    humidity: Number,
    windSpeed: Number,
    windDirection: Number,
    precipitation: Number,
    weatherCode: Number,
    weatherDescription: String,
    icon: String,
  },
  forecast: [
    {
      timestamp: Date,
      temperature: Number,
      humidity: Number,
      precipitation: Number,
      weatherCode: Number,
      weatherDescription: String,
      icon: String,
    },
  ],

  // Raw OpenWeather payloads (for full report rendering)
  currentRaw: { type: Schema.Types.Mixed },
  forecastRaw: [{ type: Schema.Types.Mixed }],
});

export default mongoose.model<IWeatherData>("WeatherData", WeatherDataSchema); 