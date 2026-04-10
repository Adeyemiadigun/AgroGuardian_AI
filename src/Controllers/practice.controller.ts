import { Response } from "express";
import { AuthRequest } from "../Types/auth.types";
import {
  createCropSeason,
  updateCropSeason,
  deleteCropSeason,
  logPracticeActivity,
  completePracticeActivity,
  getFarmActivities,
  getFarmCropSeasons,
  addCropToFarm,
  deleteCrop,
  getFarmCrops,
  getReferenceCrops,
  getReferenceCropMaturity,
  getAllPractices,
} from "../Services/practice.service";
import logger from "../Utils/logger";

export const getAllPracticesController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const practices = await getAllPractices();
    res.status(200).json({
      success: true,
      message: "Practices retrieved successfully",
      data: practices,
    });
  } catch (error: any) {
    logger.error("Error getting practices", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to get practices",
    });
  }
};

export const createCropSeasonController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const farmId = (req.params.farmId as string) as string;
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

export const addCropController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const farmId = (req.params.farmId as string) as string;
    const userId = req.user!.userId as string;

    const crop = await addCropToFarm(userId, farmId, req.body);

    logger.info("Crop added to farm", { farmId, userId });
    res.status(201).json({
      success: true,
      message: "Crop added successfully",
      data: crop,
    });
  } catch (error: any) {
    logger.error("Error adding crop", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to add crop",
    });
  }
};

export const getFarmCropsController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const farmId = (req.params.farmId as string) as string;
    const userId = req.user!.userId as string;

    const crops = await getFarmCrops(farmId, userId);
    res.status(200).json({
      success: true,
      message: "Crops retrieved successfully",
      data: crops,
    });
  } catch (error: any) {
    logger.error("Error getting crops", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to get crops",
    });
  }
};

export const getReferenceCropsController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const category = (String(req.query.category)) as string;
    const crops = await getReferenceCrops(category);
    res.status(200).json({
      success: true,
      message: "Reference crops retrieved successfully",
      data: crops,
    });
  } catch (error: any) {
    logger.error("Error getting reference crops", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to get reference crops",
    });
  }
};

export const getReferenceCropsMaturityController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const q = (v: any) => (Array.isArray(v) ? v[0] : v);
    const category = q((String(req.query.category))) as string;
    const name = q((String(req.query.name))) as string;

    const data = await getReferenceCropMaturity(category, name);

    res.status(200).json({
      success: true,
      message: "Crop maturity ranges retrieved successfully",
      data,
    });
  } catch (error: any) {
    logger.error("Error getting crop maturity ranges", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to get crop maturity ranges",
    });
  }
};

export const logActivityController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId as string;

    const result = await logPracticeActivity(
      userId, 
      {
        ...req.body,
        appliedBy: userId
      },
      req.file?.buffer
    );

    logger.info("Practice activity logged (Start)", { farmId: req.body.farmId, userId });
    res.status(201).json({
      success: true,
      message: "Practice activity initiated successfully. AI verification results included if evidence provided.",
      data: result.activity,
      evidence: result.evidence,
    });
  } catch (error: any) {
    logger.error("Error logging activity", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to log activity",
    });
  }
};

export const completeActivityController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId as string;
    const activityId = req.params.activityId as string;
    const { notes } = req.body;

    // Use a more specific check for the file from multer
    const file = (req as any).file;

    if (!file) {
      res.status(400).json({ success: false, message: "Completion image is required" });
      return;
    }

    const result = await completePracticeActivity(
      userId,
      activityId as string,
      file.buffer,
      notes
    );

    logger.info("Practice activity completion evidence uploaded", { activityId, userId });
    res.status(200).json({
      success: true,
      message: "Completion evidence uploaded and AI verification completed.",
      data: result.activity,
      evidence: result.evidence,
    });
  } catch (error: any) {
    logger.error("Error completing activity", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to complete activity",
    });
  }
};

export const getFarmActivitiesController = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const farmId = (req.params.farmId as string) as string;
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
    const farmId = (req.params.farmId as string) as string;
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

export const updateCropSeasonController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const farmId = (req.params.farmId as string) as string;
    const seasonId = (req.params.seasonId as string) as string;
    const userId = req.user!.userId as string;

    const updated = await updateCropSeason(userId, farmId, seasonId, req.body);
    res.status(200).json({
      success: true,
      message: "Crop season updated successfully",
      data: updated,
    });
  } catch (error: any) {
    logger.error("Error updating crop season", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to update crop season",
    });
  }
};

export const deleteCropSeasonController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const farmId = (req.params.farmId as string) as string;
    const seasonId = (req.params.seasonId as string) as string;
    const userId = req.user!.userId as string;

    await deleteCropSeason(userId, farmId, seasonId);
    res.status(200).json({
      success: true,
      message: "Crop season deleted successfully",
    });
  } catch (error: any) {
    logger.error("Error deleting crop season", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to delete crop season",
    });
  }
};

export const deleteCropController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const farmId = (req.params.farmId as string) as string;
    const cropId = (req.params.cropId as string) as string;
    const userId = req.user!.userId as string;

    await deleteCrop(userId, farmId, cropId);
    res.status(200).json({
      success: true,
      message: "Crop deleted successfully",
    });
  } catch (error: any) {
    logger.error("Error deleting crop", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to delete crop",
    });
  }
};
