import { Response } from "express";
import { AuthRequest } from "../Types/auth.types";
import {
  createCropSeason,
  logPracticeActivity,
  getFarmActivities,
  getFarmCropSeasons,
} from "../Services/practice.service";
import logger from "../Utils/logger";

export const createCropSeasonController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const farmId = req.params.farmId as string;
    const userId = req.user!.userId as string;

    const cropSeason = await createCropSeason(userId, farmId, req.body);

    logger.info("Crop season created", { farmId, userId });
    res.status(201).json({
      success: true,
      message: "Crop season created successfully",
      data: cropSeason,
    });
  } catch (error: any) {
    logger.error("Error creating crop season", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to create crop season",
    });
  }
};

export const logActivityController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId as string;

    const activity = await logPracticeActivity(
      userId, 
      {
        ...req.body,
        appliedBy: userId
      },
      req.file?.buffer
    );

    logger.info("Practice activity logged", { farmId: req.body.farmId, userId });
    res.status(201).json({
      success: true,
      message: "Practice activity logged successfully",
      data: activity,
    });
  } catch (error: any) {
    logger.error("Error logging activity", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to log activity",
    });
  }
};

export const getFarmActivitiesController = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const farmId = req.params.farmId as string;
        const userId = req.user!.userId as string;
    
        const activities = await getFarmActivities(farmId, userId);
        res.status(200).json({
          success: true,
          message: "Activities retrieved successfully",
          data: activities,
        });
      } catch (error: any) {
        logger.error("Error getting activities", error);
        res.status(400).json({
          success: false,
          message: error.message || "Failed to get activities",
        });
      }
};

export const getFarmCropSeasonsController = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const farmId = req.params.farmId as string;
        const userId = req.user!.userId as string;
    
        const seasons = await getFarmCropSeasons(farmId, userId);
        res.status(200).json({
          success: true,
          message: "Crop seasons retrieved successfully",
          data: seasons,
        });
      } catch (error: any) {
        logger.error("Error getting crop seasons", error);
        res.status(400).json({
          success: false,
          message: error.message || "Failed to get crop seasons",
        });
      }
};
