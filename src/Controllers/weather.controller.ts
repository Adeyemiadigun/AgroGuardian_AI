import { Response } from "express";
import { AuthRequest } from "../Types/auth.types";
import { getClimateRisk, getWeatherTrends } from "../Services/weather.service";
import WeatherAlert from "../Models/WeatherAlert";
import WeatherData from "../Models/WeatherData";
import Farm from "../Models/Farm";
import logger from "../Utils/logger";
import mongoose from "mongoose";

const findUserFarm = async (userId: string, farmId?: string) => {
  const query: any = { owner: userId };
  if (farmId && mongoose.Types.ObjectId.isValid(farmId)) {
    query._id = farmId;
  }

  const farm = await Farm.findOne(query);
  if (!farm) {
    if (farmId) {
      throw new Error("Farm not found or you do not have permission to access it.");
    }
    throw new Error("No farm associated with this account. Please create a farm first.");
  }
  return farm;
};


export const getFarmRisk = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { farmId: queryFarmId } = req.query;
    const farm = await findUserFarm(userId, queryFarmId as string);
    const farmId = (farm._id as mongoose.Types.ObjectId).toString();

    const intelligence = await getClimateRisk(farmId);

    const alerts = await WeatherAlert.find({ farmId: farm._id, acknowledged: false })
      .sort({ timestamp: -1 })
      .limit(5);

    logger.info("Weather intelligence report generated for farm", { farmId, userId });
    res.status(200).json({
        success: true,
        message: "Weather intelligence report generated for your farm",
        data: {
            risk: intelligence.climateRisk,
            plantingWindow: intelligence.plantingWindow,
            precisionWindows: intelligence.precisionWindows,
            alerts: alerts,
            location: farm.location
        }
    });
  } catch (error: any) {
    logger.error("Error generating weather intelligence", error);
    res.status(error.message.includes("not found") ? 404 : 400).json({
      success: false,
      message: error.message || "An error occurred while fetching weather data."
    });
  }
};


export const getCurrentWeather = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { farmId: queryFarmId } = req.query;
    const farm = await findUserFarm(userId, queryFarmId as string);
    const farmId = farm._id as mongoose.Types.ObjectId;

    const latestWeather = await WeatherData.findOne({ farmId: farmId })
      .sort({ timestamp: -1 });

    if (!latestWeather) {
      await getClimateRisk(farmId.toString());
      const freshWeather = await WeatherData.findOne({ farmId: farmId })
        .sort({ timestamp: -1 });

      logger.info("Current weather retrieved (freshly updated)", { farmId, userId });
      res.status(200).json({
        success: true,
        message: "Current weather retrieved (freshly updated)",
        data: {
          ...freshWeather?.toObject(),
          location: farm.location
        }
      });
      return;
    }

    logger.info("Current weather retrieved from last snapshot", { farmId, userId });
    res.status(200).json({
      success: true,
      message: "Current weather retrieved from last snapshot",
      data: {
        ...latestWeather.toObject(),
        location: farm.location
      }
    });
  } catch (error: any) {
    logger.error("Error retrieving current weather", error);
    res.status(error.message.includes("not found") ? 404 : 400).json({
      success: false,
      message: error.message || "Failed to retrieve current weather"
    });
  }
};


export const getRiskHistory = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const { farmId: queryFarmId } = req.query;
        const farm = await findUserFarm(userId, queryFarmId as string);
        const farmId = (farm._id as mongoose.Types.ObjectId).toString();

        const trends = await getWeatherTrends(farmId);

        logger.info("30-day weather trends retrieved", { farmId, userId });
        res.status(200).json({
            success: true,
            message: "30-day weather trends retrieved for your farm",
            data: {
                trends,
                location: farm.location
            }
        });
    } catch (error: any) {
        logger.error("Error fetching risk history", error);
        res.status(error.message.includes("not found") ? 404 : 400).json({
            success: false,
            message: error.message || "Failed to fetch risk history"
        });
    }
};
