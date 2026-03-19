import { Response } from "express";
import { AuthRequest } from "../Types/auth.types";
import {
  generateCreditsForFarm,
  getFarmCredits,
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
        const farmId = req.params.farmId as string; 
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
