import { Response } from "express";
import { AuthRequest } from "../Types/auth.types";
import { getResilienceProfile, updateResilienceProfile } from "../Services/resilience.service";
import logger from "../Utils/logger";

export const getFarmResilience = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const farmId = (req.params.farmId as string) as string;
    const userId = req.user!.userId;

    const profile = await getResilienceProfile(farmId, userId);
    
    res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (error: any) {
    logger.error(`Get Resilience Error: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const triggerResilienceSync = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const farmId = (req.params.farmId as string) as string;
    const userId = req.user!.userId;

    const profile = await updateResilienceProfile(farmId, userId);
    
    res.status(200).json({
      success: true,
      message: "Resilience profile synchronized successfully",
      data: profile,
    });
  } catch (error: any) {
    logger.error(`Sync Resilience Error: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};
