import axios from "axios";
import Farm from "../Models/Farm";
import WeatherData from "../Models/WeatherData";
import ClimateRisk from "../Models/ClimateRisk";
import WeatherAlert from "../Models/WeatherAlert";
import mongoose from "mongoose";
import logger from "../Utils/logger";
import { PlantingWindow } from "../Types/weather.types";
import { addResilienceSyncJob } from "../Queues/resilience.queue";

const API_KEY = process.env.WEATHER_API_KEY || "YOUR_OPENWEATHER_API_KEY";
const BASE_URL = "https://api.openweathermap.org/data/2.5";


const calculateRisks = (current: any, forecast: any[]) => {
      logger.debug('Calculating climate risks', { current, forecast });
    const avgTemp = forecast.reduce((acc, f) => acc + f.main.temp, 0) / forecast.length;
    const totalRain = forecast.reduce((acc, f) => acc + (f.rain ? f.rain["3h"] || 0 : 0), 0);
    const avgHumidity = forecast.reduce((acc, f) => acc + f.main.humidity, 0) / forecast.length;

    let droughtRisk: 'low' | 'medium' | 'high' = 'low';
    let floodRisk: 'low' | 'medium' | 'high' = 'low';
    let heatRisk: 'low' | 'medium' | 'high' = 'low';
    let pestRisk: 'low' | 'medium' | 'high' = 'low';
    let diseaseRisk: 'low' | 'medium' | 'high' = 'low';

    if (totalRain < 5 && avgTemp > 30) droughtRisk = 'high';
    else if (totalRain < 10) droughtRisk = 'medium';

    const maxRainBlock = Math.max(...forecast.map(f => (f.rain ? f.rain["3h"] || 0 : 0)));
    if (maxRainBlock > 30 || totalRain > 100) floodRisk = 'high';
    else if (maxRainBlock > 15) floodRisk = 'medium';

    if (current.main.temp > 35 || avgTemp > 33) heatRisk = 'high';
    else if (current.main.temp > 30) heatRisk = 'medium';

    if (avgHumidity > 80) {
        pestRisk = 'high';
        diseaseRisk = 'high';
    } else if (avgHumidity > 60) {
        pestRisk = 'medium';
        diseaseRisk = 'medium';
    }

    return { droughtRisk, floodRisk, heatRisk, pestRisk, diseaseRisk };
};

const calculatePlantingWindow = (forecast: any[]): PlantingWindow[] => {
      logger.debug('Calculating planting window', { forecast });
    const dailyForecast: { [key: string]: any[] } = {};
    forecast.forEach(f => {
      const date = new Date(f.dt * 1000).toISOString().split('T')[0];
      if (!dailyForecast[date]) dailyForecast[date] = [];
      dailyForecast[date].push(f);
    });

    return Object.entries(dailyForecast).map(([date, blocks]) => {
      const avgTemp = blocks.reduce((acc, b) => acc + b.main.temp, 0) / blocks.length;
      const totalRain = blocks.reduce((acc, b) => acc + (b.rain ? b.rain["3h"] || 0 : 0), 0);
      const avgHumidity = blocks.reduce((acc, b) => acc + b.main.humidity, 0) / blocks.length;

      let score = 100;
      let reasons = [];

      if (avgTemp < 15 || avgTemp > 35) {
        score -= 40;
        reasons.push(avgTemp < 15 ? "Too cold for germination" : "Heat stress risk");
      } else if (avgTemp < 18 || avgTemp > 30) {
        score -= 15;
        reasons.push("Sub-optimal temperature");
      }

      if (totalRain > 30) {
        score -= 50;
        reasons.push("High flood/washout risk");
      } else if (totalRain < 2) {
        score -= 20;
        reasons.push("Low soil moisture");
      }

      if (avgHumidity > 85) {
        score -= 10;
        reasons.push("High fungal risk");
      }

      return {
        date: new Date(date),
        score: Math.max(0, score),
        reason: reasons.length > 0 ? reasons.join(", ") : "Ideal conditions",
        isViable: score >= 60
      };
    });
};

const generateRiskNotes = (risks: any, window: PlantingWindow[]): string => {
      logger.debug('Generating risk notes', { risks, window });
    const highRisks = Object.entries(risks)
      .filter(([_, value]) => value === 'high')
      .map(([key]) => key.replace('Risk', ''));
    
    const bestDay = [...window].sort((a, b) => b.score - a.score)[0];
    const plantingAdvice = (bestDay && bestDay.isViable)
      ? `Best planting date detected: ${bestDay.date.toDateString()} (Score: ${bestDay.score}%).` 
      : "No ideal planting window in the next 5 days. Monitor for moisture improvements.";

    if (highRisks.length === 0) return `Conditions stable. ${plantingAdvice}`;
    return `Critical high risk detected: ${highRisks.join(", ")}. ${plantingAdvice}`;
};

const generateAlerts = async (farmId: string, risks: any) => {
      logger.debug('Generating alerts', { farmId, risks });
    const alertEntries = Object.entries(risks)
      .filter(([_, value]) => value === 'high')
      .map(([key]) => ({
        farmId: new mongoose.Types.ObjectId(farmId),
        timestamp: new Date(),
        type: key.replace('Risk', '').toLowerCase() as any,
        level: 'warning',
        message: `High ${key.replace('Risk', '')} risk detected.`,
      }));

    if (alertEntries.length > 0) {
      await WeatherAlert.insertMany(alertEntries);
    }
};


export const getClimateRisk = async (farmId: string) => {
      logger.info(`Fetching climate risk for farm ${farmId}`);
    const farm = await Farm.findById(farmId);
    if (!farm) {
      logger.error(`Farm not found: ${farmId}`);
      throw new Error("Farm not found");
    }

    const { latitude, longitude } = farm.location.coordinates;
    logger.debug('Farm location', { latitude, longitude });

    try {
      logger.info('Requesting weather data from OpenWeather API');
      const [currentRes, forecastRes] = await Promise.all([
        axios.get(`${BASE_URL}/weather`, {
          params: { lat: latitude, lon: longitude, appid: API_KEY, units: "metric" },
        }),
        axios.get(`${BASE_URL}/forecast`, {
          params: { lat: latitude, lon: longitude, appid: API_KEY, units: "metric" },
        })
      ]);

      const currentRaw = currentRes.data as any;
      const forecastRaw = (forecastRes.data as any).list as any[];
      logger.debug('Weather API responses', { currentRaw, forecastRaw });

      await WeatherData.create({
        farmId: farm._id,
        timestamp: new Date(),
        provider: "OpenWeather",
        location: { lat: latitude, lon: longitude, name: currentRaw.name },
        current: {
          temperature: currentRaw.main.temp,
          humidity: currentRaw.main.humidity,
          windSpeed: currentRaw.wind.speed,
          windDirection: currentRaw.wind.deg,
          precipitation: currentRaw.rain ? currentRaw.rain["1h"] || 0 : 0,
          weatherCode: currentRaw.weather[0].id,
          weatherDescription: currentRaw.weather[0].description,
          icon: currentRaw.weather[0].icon,
        },
        forecast: forecastRaw.slice(0, 8).map((f: any) => ({
          timestamp: new Date(f.dt * 1000),
          temperature: f.main.temp,
          humidity: f.main.humidity,
          precipitation: f.rain ? f.rain["3h"] || 0 : 0,
          weatherCode: f.weather[0].id,
          weatherDescription: f.weather[0].description,
          icon: f.weather[0].icon,
        })),
      });

      const risks = calculateRisks(currentRaw, forecastRaw);
      logger.debug('Calculated risks', risks);
      const plantingWindow = calculatePlantingWindow(forecastRaw);
      logger.debug('Calculated planting window', plantingWindow);

      const climateRisk = await ClimateRisk.create({
        farmId: farm._id,
        timestamp: new Date(),
        ...risks,
        notes: generateRiskNotes(risks, plantingWindow),
      });
      logger.info('Climate risk record created', climateRisk);

      await generateAlerts(farmId, risks);
      logger.info('Alerts generated (if any)');

      addResilienceSyncJob(farmId, farm.owner.toString());

      return {
        climateRisk,
        plantingWindow
      };
    } catch (error: any) {
      logger.error('Error in getClimateRisk', { error });
      if ((axios as any).isAxiosError && (axios as any).isAxiosError(error)) {
        throw new Error(`Weather API Error: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
};


export const getWeatherTrends = async (farmId: string) => {
      logger.info(`Fetching weather trends for farm ${farmId}`);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return await WeatherData.aggregate([
      { $match: { farmId: new mongoose.Types.ObjectId(farmId), timestamp: { $gte: thirtyDaysAgo } } },
      { $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
          avgTemp: { $avg: "$current.temperature" },
          avgHumidity: { $avg: "$current.humidity" },
          totalRain: { $sum: "$current.precipitation" }
      }},
      { $sort: { "_id": 1 } }
    ]);
};
