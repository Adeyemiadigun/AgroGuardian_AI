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

// Enhanced drought risk calculation
const calculateEnhancedDroughtRisk = (
  current: any,
  forecast: any[],
  soilTypes: string[],
  irrigationType: string
): { risk: 'low' | 'medium' | 'high', score: number, factors: string[] } => {
  
  let droughtScore = 0; // 0-100, higher = more drought risk
  const factors: string[] = [];
  
  const avgTemp = forecast.reduce((acc, f) => acc + f.main.temp, 0) / forecast.length;
  const totalRain = forecast.reduce((acc, f) => acc + (f.rain?.["3h"] || 0), 0);
  const avgHumidity = forecast.reduce((acc, f) => acc + f.main.humidity, 0) / forecast.length;
  
  // 1. RAINFALL DEFICIT (0-35 points)
  if (totalRain < 5 && avgTemp > 30) {
    droughtScore += 35;
    factors.push('Very low rainfall with high temperatures');
  } else if (totalRain < 10) {
    droughtScore += 20;
    factors.push('Below average rainfall expected');
  } else if (totalRain < 20) {
    droughtScore += 10;
  }
  
  // 2. SOIL WATER RETENTION (0-25 points)
  // Sandy soil dries out faster, clay retains water longer
  const soilRetentionRisk: { [key: string]: number } = {
    'sandy': 25,           // Worst for drought (dries fast)
    'sandy-loam': 18,
    'loamy': 12,
    'laterite': 10,
    'silty': 8,
    'clay-loam': 5,
    'peaty': 3,
    'clay': 0,             // Best for drought (retains water)
  };
  const maxSoilRisk = Math.max(...soilTypes.map(s => soilRetentionRisk[s] || 12));
  droughtScore += maxSoilRisk;
  
  if (maxSoilRisk >= 18) {
    const dominantSoil = soilTypes.find(s => soilRetentionRisk[s] === maxSoilRisk) || soilTypes[0];
    factors.push(`${dominantSoil} soil has poor water retention`);
  }
  
  // 3. IRRIGATION AVAILABILITY (0-20 points)
  const irrigationDroughtRisk: { [key: string]: number } = {
    'none': 20,            // Worst - no water source
    'rainfed': 15,         // Depends entirely on rain
    'sprinkler': 5,        // Can supplement
    'drip': 3,             // Efficient but limited
    'flood': 0,            // Best - abundant water
  };
  const irrigRisk = irrigationDroughtRisk[irrigationType] || 10;
  droughtScore += irrigRisk;
  
  if (irrigRisk >= 15) {
    factors.push(`${irrigationType === 'none' ? 'No' : 'Rainfed'} irrigation - vulnerable to drought`);
  }
  
  // 4. HIGH TEMPERATURE (0-15 points)
  if (avgTemp > 35) {
    droughtScore += 15;
    factors.push('Extreme heat increases evapotranspiration');
  } else if (avgTemp > 30) {
    droughtScore += 8;
    factors.push('High temperatures increase water demand');
  }
  
  // 5. LOW HUMIDITY (0-5 points)
  if (avgHumidity < 40) {
    droughtScore += 5;
    factors.push('Very low humidity accelerates soil drying');
  } else if (avgHumidity < 50) {
    droughtScore += 3;
  }
  
  let risk: 'low' | 'medium' | 'high';
  if (droughtScore >= 60) risk = 'high';
  else if (droughtScore >= 30) risk = 'medium';
  else risk = 'low';
  
  logger.debug('Enhanced drought risk calculated', { droughtScore, risk, factors, soilTypes, irrigationType });
  
  return { risk, score: droughtScore, factors };
};

// Enhanced heat stress risk calculation
const calculateEnhancedHeatRisk = (
  current: any,
  forecast: any[],
  soilTypes: string[],
  irrigationType: string
): { risk: 'low' | 'medium' | 'high', score: number, factors: string[] } => {
  
  let heatScore = 0;
  const factors: string[] = [];
  
  const avgTemp = forecast.reduce((acc, f) => acc + f.main.temp, 0) / forecast.length;
  const maxTemp = Math.max(...forecast.map(f => f.main.temp));
  
  // 1. EXTREME TEMPERATURES (0-40 points)
  if (maxTemp > 40) {
    heatScore += 40;
    factors.push(`Extreme heat: ${maxTemp.toFixed(1)}°C expected`);
  } else if (maxTemp > 35) {
    heatScore += 25;
    factors.push(`Very high temperature: ${maxTemp.toFixed(1)}°C`);
  } else if (avgTemp > 33) {
    heatScore += 15;
    factors.push('Sustained high temperatures');
  } else if (current.main.temp > 30) {
    heatScore += 8;
  }
  
  // 2. SOIL MOISTURE BUFFERING (0-25 points)
  // Clay retains moisture better, reducing heat stress
  const soilHeatRisk: { [key: string]: number } = {
    'sandy': 25,           // Worst - dries out, heats up
    'laterite': 20,
    'sandy-loam': 18,
    'loamy': 12,
    'silty': 10,
    'clay-loam': 8,
    'peaty': 5,
    'clay': 0,             // Best - stays moist, cooler
  };
  const maxSoilHeat = Math.max(...soilTypes.map(s => soilHeatRisk[s] || 12));
  heatScore += maxSoilHeat;
  
  if (maxSoilHeat >= 18) {
    const dominantSoil = soilTypes.find(s => soilHeatRisk[s] === maxSoilHeat) || soilTypes[0];
    factors.push(`${dominantSoil} soil provides poor heat buffering`);
  }
  
  // 3. IRRIGATION COOLING EFFECT (0-20 points)
  const irrigationHeatRisk: { [key: string]: number } = {
    'none': 20,            // No cooling
    'rainfed': 15,
    'drip': 10,            // Some cooling
    'sprinkler': 5,        // Good cooling
    'flood': 0,            // Best cooling
  };
  const irrigHeat = irrigationHeatRisk[irrigationType] || 10;
  heatScore += irrigHeat;
  
  if (irrigHeat >= 15) {
    factors.push('No irrigation to mitigate heat stress');
  }
  
  // 4. HUMIDITY (0-15 points)
  const avgHumidity = forecast.reduce((acc, f) => acc + f.main.humidity, 0) / forecast.length;
  if (avgHumidity < 30) {
    heatScore += 15;
    factors.push('Very low humidity compounds heat stress');
  } else if (avgHumidity < 40) {
    heatScore += 8;
  }
  
  let risk: 'low' | 'medium' | 'high';
  if (heatScore >= 60) risk = 'high';
  else if (heatScore >= 30) risk = 'medium';
  else risk = 'low';
  
  logger.debug('Enhanced heat risk calculated', { heatScore, risk, factors, soilTypes, irrigationType });
  
  return { risk, score: heatScore, factors };
};

// Enhanced pest and disease risk calculation
const calculateEnhancedPestDiseaseRisk = (
  current: any,
  forecast: any[],
  soilTypes: string[],
  irrigationType: string
): { 
  pestRisk: 'low' | 'medium' | 'high', 
  diseaseRisk: 'low' | 'medium' | 'high',
  pestScore: number,
  diseaseScore: number,
  pestFactors: string[],
  diseaseFactors: string[]
} => {
  
  let pestScore = 0;
  let diseaseScore = 0;
  const pestFactors: string[] = [];
  const diseaseFactors: string[] = [];
  
  const avgHumidity = forecast.reduce((acc, f) => acc + f.main.humidity, 0) / forecast.length;
  const avgTemp = forecast.reduce((acc, f) => acc + f.main.temp, 0) / forecast.length;
  const totalRain = forecast.reduce((acc, f) => acc + (f.rain?.["3h"] || 0), 0);
  
  // 1. HUMIDITY LEVELS (0-40 points for both)
  if (avgHumidity > 85) {
    pestScore += 35;
    diseaseScore += 40;
    pestFactors.push('Very high humidity favors pest breeding');
    diseaseFactors.push('Very high humidity ideal for fungal diseases');
  } else if (avgHumidity > 70) {
    pestScore += 20;
    diseaseScore += 25;
    pestFactors.push('High humidity supports pest activity');
    diseaseFactors.push('High humidity promotes disease spread');
  } else if (avgHumidity > 60) {
    pestScore += 10;
    diseaseScore += 12;
  }
  
  // 2. SOIL DRAINAGE & STANDING WATER (0-25 points)
  // Poor drainage = more standing water = more pests/diseases
  const soilPestRisk: { [key: string]: number } = {
    'clay': 25,            // Worst - holds water, creates habitat
    'silty': 20,
    'peaty': 18,
    'clay-loam': 15,
    'laterite': 12,
    'loamy': 8,
    'sandy-loam': 5,
    'sandy': 0,            // Best - drains well
  };
  const maxSoilPest = Math.max(...soilTypes.map(s => soilPestRisk[s] || 8));
  
  if (avgHumidity > 70) { // Only matters when humid
    pestScore += maxSoilPest;
    diseaseScore += maxSoilPest;
    
    if (maxSoilPest >= 20) {
      const dominantSoil = soilTypes.find(s => soilPestRisk[s] === maxSoilPest) || soilTypes[0];
      pestFactors.push(`${dominantSoil} soil retains moisture, attracting pests`);
      diseaseFactors.push(`${dominantSoil} soil stays wet, promoting diseases`);
    }
  }
  
  // 3. IRRIGATION SYSTEM (0-20 points)
  // Flood irrigation = standing water = pest breeding ground
  const irrigationPestRisk: { [key: string]: number } = {
    'flood': 20,           // Worst - creates standing water
    'sprinkler': 12,       // Wets leaves, increases disease
    'rainfed': 8,
    'none': 5,
    'drip': 0,             // Best - targets roots only
  };
  const irrigPest = irrigationPestRisk[irrigationType] || 8;
  
  if (avgHumidity > 60) { // Only matters when humid
    pestScore += irrigPest;
    diseaseScore += irrigPest;
    
    if (irrigationType === 'flood') {
      pestFactors.push('Flood irrigation creates mosquito breeding sites');
      diseaseFactors.push('Flood irrigation creates waterlogged conditions');
    } else if (irrigationType === 'sprinkler') {
      diseaseFactors.push('Sprinkler irrigation wets foliage, increasing disease risk');
    }
  }
  
  // 4. TEMPERATURE (0-15 points)
  // Warm + humid = worst for pests and diseases
  if (avgTemp > 25 && avgTemp < 35 && avgHumidity > 60) {
    pestScore += 15;
    diseaseScore += 15;
    pestFactors.push('Warm humid conditions optimal for pest reproduction');
    diseaseFactors.push('Warm humid conditions favor pathogen growth');
  } else if (avgTemp > 20 && avgTemp < 30) {
    pestScore += 8;
    diseaseScore += 8;
  }
  
  let pestRisk: 'low' | 'medium' | 'high';
  if (pestScore >= 60) pestRisk = 'high';
  else if (pestScore >= 30) pestRisk = 'medium';
  else pestRisk = 'low';
  
  let diseaseRisk: 'low' | 'medium' | 'high';
  if (diseaseScore >= 60) diseaseRisk = 'high';
  else if (diseaseScore >= 30) diseaseRisk = 'medium';
  else diseaseRisk = 'low';
  
  logger.debug('Enhanced pest/disease risk calculated', { 
    pestScore, diseaseScore, pestRisk, diseaseRisk, 
    pestFactors, diseaseFactors, soilTypes, irrigationType 
  });
  
  return { pestRisk, diseaseRisk, pestScore, diseaseScore, pestFactors, diseaseFactors };
};
const getSoilDrainageMultiplier = (soilTypes: string[]): number => {
  const multipliers: { [key: string]: number } = {
    'clay': 2.0,           // Very poor drainage
    'silty': 1.6,          // Poor drainage
    'clay-loam': 1.4,      // Below average drainage
    'laterite': 1.3,       // Poor when compacted
    'peaty': 1.2,          // Variable, often poor
    'loamy': 1.0,          // Good drainage (baseline)
    'sandy-loam': 0.7,     // Good drainage
    'sandy': 0.5,          // Excellent drainage
  };
  
  // Use worst (highest) multiplier if multiple soil types
  const maxMultiplier = Math.max(...soilTypes.map(s => multipliers[s] || 1.0));
  return maxMultiplier;
};

// Helper: Get soil-specific flood risk score
const getSoilFloodRisk = (soilTypes: string[]): { score: number, reason: string } => {
  const riskScores: { [key: string]: number } = {
    'clay': 30,           // Highest risk
    'silty': 22,
    'laterite': 20,
    'clay-loam': 18,
    'peaty': 15,
    'loamy': 10,
    'sandy-loam': 5,
    'sandy': 0,           // Lowest risk
  };
  
  const maxScore = Math.max(...soilTypes.map(s => riskScores[s] || 10));
  const dominantSoil = soilTypes.find(s => riskScores[s] === maxScore) || soilTypes[0];
  
  let reason = '';
  if (maxScore >= 20) {
    reason = `${dominantSoil} soil has very poor drainage`;
  } else if (maxScore >= 15) {
    reason = `${dominantSoil} soil has limited drainage capacity`;
  }
  
  return { score: maxScore, reason };
};

// Helper: Get irrigation system flood risk
const getIrrigationFloodRisk = (irrigationType: string): { score: number, reason: string } => {
  const riskMap: { [key: string]: { score: number, reason: string } } = {
    'flood': { 
      score: 15, 
      reason: 'Flood irrigation creates standing water risk' 
    },
    'none': { 
      score: 10, 
      reason: 'No irrigation - relies fully on rainfall drainage' 
    },
    'rainfed': { 
      score: 8, 
      reason: 'Rainfed system with no drainage management' 
    },
    'sprinkler': { 
      score: 5, 
      reason: 'Sprinkler irrigation can oversaturate soil' 
    },
    'drip': { 
      score: 0, 
      reason: '' 
    },
  };
  
  return riskMap[irrigationType] || { score: 5, reason: '' };
};

// Enhanced flood risk calculation
const calculateEnhancedFloodRisk = (
  current: any, 
  forecast: any[], 
  soilTypes: string[],
  irrigationType: string
): { risk: 'low' | 'medium' | 'high', score: number, factors: string[] } => {
  
  let floodScore = 0; // 0-100, higher = more flood risk
  const factors: string[] = [];
  
  // 1. RAINFALL ANALYSIS (0-40 points)
  const totalRain = forecast.reduce((acc, f) => acc + (f.rain?.["3h"] || 0), 0);
  const maxRainBlock = Math.max(...forecast.map(f => f.rain?.["3h"] || 0));
  
  // Adjust rainfall thresholds based on soil drainage
  const soilDrainageMultiplier = getSoilDrainageMultiplier(soilTypes);
  const adjustedMaxRain = maxRainBlock * soilDrainageMultiplier;
  const adjustedTotalRain = totalRain * soilDrainageMultiplier;
  
  if (adjustedMaxRain > 40) {
    floodScore += 25;
    factors.push(`Intense rainfall: ${maxRainBlock.toFixed(1)}mm/3h on ${soilTypes[0]} soil`);
  } else if (adjustedMaxRain > 20) {
    floodScore += 15;
    factors.push(`Heavy rainfall expected: ${maxRainBlock.toFixed(1)}mm/3h`);
  }
  
  if (adjustedTotalRain > 120) {
    floodScore += 15;
    factors.push(`High cumulative rainfall: ${totalRain.toFixed(1)}mm total`);
  } else if (adjustedTotalRain > 60) {
    floodScore += 8;
  }
  
  // 2. SOIL DRAINAGE CAPACITY (0-30 points)
  const soilRisk = getSoilFloodRisk(soilTypes);
  floodScore += soilRisk.score;
  if (soilRisk.score > 15) {
    factors.push(soilRisk.reason);
  }
  
  // 3. IRRIGATION SYSTEM IMPACT (0-15 points)
  const irrigationRisk = getIrrigationFloodRisk(irrigationType);
  floodScore += irrigationRisk.score;
  if (irrigationRisk.score > 5) {
    factors.push(irrigationRisk.reason);
  }
  
  // 4. HUMIDITY & EVAPORATION (0-10 points)
  const avgHumidity = forecast.reduce((acc, f) => acc + f.main.humidity, 0) / forecast.length;
  if (avgHumidity > 85) {
    floodScore += 10;
    factors.push('Very high humidity reduces evaporation');
  } else if (avgHumidity > 75) {
    floodScore += 5;
  }
  
  // 5. TEMPERATURE & EVAPOTRANSPIRATION (0-5 points)
  const avgTemp = forecast.reduce((acc, f) => acc + f.main.temp, 0) / forecast.length;
  if (avgTemp < 20) {
    floodScore += 5;
    factors.push('Cool temperatures slow water evaporation');
  } else if (avgTemp < 25) {
    floodScore += 2;
  }
  
  // Determine risk level
  let risk: 'low' | 'medium' | 'high';
  if (floodScore >= 60) risk = 'high';
  else if (floodScore >= 30) risk = 'medium';
  else risk = 'low';
  
  logger.debug('Enhanced flood risk calculated', { 
    floodScore, 
    risk, 
    factors,
    soilTypes,
    irrigationType,
    soilDrainageMultiplier 
  });
  
  return { risk, score: floodScore, factors };
};

const calculateRisks = (current: any, forecast: any[], soilTypes: string[] = ['loamy'], irrigationType: string = 'rainfed') => {
      logger.debug('Calculating climate risks', { current, forecast, soilTypes, irrigationType });
    
    // ENHANCED DROUGHT RISK - Uses soil retention and irrigation
    const droughtRiskData = calculateEnhancedDroughtRisk(current, forecast, soilTypes, irrigationType);
    const droughtRisk = droughtRiskData.risk;

    // ENHANCED FLOOD RISK - Uses soil drainage and irrigation system
    const floodRiskData = calculateEnhancedFloodRisk(current, forecast, soilTypes, irrigationType);
    const floodRisk = floodRiskData.risk;

    // ENHANCED HEAT RISK - Uses soil moisture buffering and irrigation cooling
    const heatRiskData = calculateEnhancedHeatRisk(current, forecast, soilTypes, irrigationType);
    const heatRisk = heatRiskData.risk;

    // ENHANCED PEST & DISEASE RISK - Uses soil drainage and irrigation method
    const pestDiseaseData = calculateEnhancedPestDiseaseRisk(current, forecast, soilTypes, irrigationType);
    const pestRisk = pestDiseaseData.pestRisk;
    const diseaseRisk = pestDiseaseData.diseaseRisk;

    return { 
      droughtRisk, 
      floodRisk, 
      heatRisk, 
      pestRisk, 
      diseaseRisk,
      // Detailed risk breakdowns
      droughtRiskDetails: droughtRiskData,
      floodRiskDetails: floodRiskData,
      heatRiskDetails: heatRiskData,
      pestRiskDetails: {
        score: pestDiseaseData.pestScore,
        factors: pestDiseaseData.pestFactors,
      },
      diseaseRiskDetails: {
        score: pestDiseaseData.diseaseScore,
        factors: pestDiseaseData.diseaseFactors,
      },
    };
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

const generateRiskNotes = (risks: any, window: PlantingWindow[], precisionWindows?: any): string => {
      logger.debug('Generating risk notes', { risks, window, precisionWindows });
    const highRisks = Object.entries(risks)
      .filter(([_, value]) => value === 'high')
      .map(([key]) => key.replace('Risk', ''));
    
    // Find the best day that also has precision planting slots
    const plantingSlotDates = new Set(
      (precisionWindows?.planting || []).map((slot: any) => slot.date)
    );
    
    // Sort by score, then filter to only days with precision slots
    const sortedWindow = [...window].sort((a, b) => b.score - a.score);
    const bestDayWithSlots = sortedWindow.find(day => {
      const dateStr = day.date.toISOString().split('T')[0];
      return day.isViable && plantingSlotDates.has(dateStr);
    });
    
    // Fallback to best day overall if no slots available
    const bestDay = bestDayWithSlots || sortedWindow[0];
    
    let plantingAdvice: string;
    if (bestDayWithSlots) {
      plantingAdvice = `Best planting date detected: ${bestDayWithSlots.date.toDateString()} (Score: ${bestDayWithSlots.score}%). Optimal hourly slots available.`;
    } else if (bestDay && bestDay.isViable) {
      plantingAdvice = `Recommended planting date: ${bestDay.date.toDateString()} (Score: ${bestDay.score}%). Note: Limited optimal hourly windows.`;
    } else {
      plantingAdvice = "No ideal planting window in the next 5 days. Monitor for moisture improvements.";
    }

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



const calculatePrecisionWindows = (forecastList: any[]) => {
  const windows: any = { planting: [], harvesting: [], spraying: [] };
  forecastList.forEach(item => {
    const dateTime = new Date(item.dt * 1000);
    const date = dateTime.toISOString().split('T')[0];
    const time = dateTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    const { temp, humidity } = item.main;
    const windSpeed = item.wind.speed * 3.6; // m/s to km/h
    const rain = item.rain ? (item.rain['3h'] || 0) : 0;

    if (temp >= 20 && temp <= 28 && humidity >= 50 && humidity <= 75) {
      windows.planting.push({ date, time, reason: "Optimal temp/humidity" });
    }
    if (rain === 0 && humidity < 60 && windSpeed < 15) {
      windows.harvesting.push({ date, time, reason: "Dry and calm" });
    }
    if (windSpeed < 5 && rain === 0) {
      windows.spraying.push({ date, time, reason: "Low wind" });
    }
  });
  return windows;
};

const determineClimateZone = (lat: number): "tropical" | "arid" | "temperate" | "continental" | "polar" => {
  const absLat = Math.abs(lat);
  if (absLat <= 23.5) return "tropical";
  if (absLat <= 35) return "arid"; // Subtropical/Arid transition
  if (absLat <= 50) return "temperate";
  if (absLat <= 66.5) return "continental";
  return "polar";
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
      // Update farm climate zone if not set
      const climateZone = determineClimateZone(latitude);
      if (farm.climateZone !== climateZone) {
        farm.climateZone = climateZone;
        await farm.save();
        logger.info(`Updated farm ${farmId} climate zone to ${climateZone}`);
      }

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

        // Store raw OpenWeather payloads for full UI reporting
        currentRaw,
        forecastRaw,
      });

      // Pass farm's soil type and irrigation system for enhanced flood risk calculation
      const risks = calculateRisks(currentRaw, forecastRaw, farm.soilType, farm.irrigationType);
      logger.debug('Calculated risks', risks);
      const plantingWindow = calculatePlantingWindow(forecastRaw);
      const precisionWindows = calculatePrecisionWindows(forecastRaw);
      logger.debug('Calculated planting window', plantingWindow);

      const climateRisk = await ClimateRisk.create({
        farmId: farm._id,
        timestamp: new Date(),
        ...risks,
        notes: generateRiskNotes(risks, plantingWindow, precisionWindows),
      });
      logger.info('Climate risk record created', climateRisk);

      await generateAlerts(farmId, risks);
      logger.info('Alerts generated (if any)');

      addResilienceSyncJob(farmId, farm.owner.toString());

      return {
        climateRisk,
        plantingWindow,
        precisionWindows
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
