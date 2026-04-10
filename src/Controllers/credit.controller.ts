import { Response } from "express";
import { AuthRequest } from "../Types/auth.types";
import {
  generateCreditsForFarm,
  getFarmCredits,
  getAllUserCredits,
  getFarmerMonthlySummary,
  getFarmMonthlySummary,
} from "../Services/credit.service";
import logger from "../Utils/logger";

export const generateCreditsController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { farmId, periodStart, periodEnd } = req.body;
    const userId = req.user!.userId as string;

    const result = await generateCreditsForFarm(
      farmId,
      userId,
      new Date(periodStart),
      new Date(periodEnd)
    );

    logger.info("Carbon credits generated", { farmId, userId });
    res.status(201).json({
      success: true,
      message: "Carbon credits generated successfully",
      data: result,
    });
  } catch (error: any) {
    logger.error("Error generating credits", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to generate credits",
    });
  }
};

export const getFarmCreditsController = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const farmId = (req.params.farmId as string) as string; 
        const userId = req.user!.userId as string;
    
        const credits = await getFarmCredits(farmId, userId);
        res.status(200).json({
          success: true,
          message: "Credits retrieved successfully",
          data: credits,
        });
      } catch (error: any) {
        logger.error("Error getting credits", error);
        res.status(400).json({
          success: false,
          message: error.message || "Failed to get credits",
        });
      }
};

export const getUserCreditsController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId as string;

    const credits = await getAllUserCredits(userId);
    res.status(200).json({
      success: true,
      message: "User credits retrieved successfully",
      data: credits,
    });
  } catch (error: any) {
    logger.error("Error getting user credits", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to get user credits",
    });
  }
};

export const getFarmerSummaryController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId as string;
    const { status } = req.query;

    const summary = await getFarmerMonthlySummary(userId, status as string);
    res.status(200).json({
      success: true,
      message: "Farmer monthly credit summary retrieved",
      data: summary,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message || "Failed to get summary",
    });
  }
};

export const getFarmSummaryController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId as string;
    const farmId = req.params.farmId as string;
    const { status } = req.query;

    const summary = await getFarmMonthlySummary(farmId, userId, status as string);
    res.status(200).json({
      success: true,
      message: "Farm monthly credit summary retrieved",
      data: summary,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message || "Failed to get farm summary",
    });
  }
};
