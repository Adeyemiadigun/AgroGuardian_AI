import { Response } from "express";
import { AuthRequest } from "../Types/auth.types";
import {
  getLivestockByFarm,
  getLivestockById,
  createLivestock,
  updateLivestock,
  addWeightRecord,
  deleteLivestock,
  getLivestockStats,
  getAllUserLivestock,
  getLivestockDashboardSummary
} from "../Services/livestock.service";
import { createLivestockSchema, updateLivestockSchema, addWeightSchema } from "../Validators/livestock.validator";
import logger from "../Utils/logger";

// Get all livestock for a farm
export const getLivestockController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const farmId = req.params.farmId as string;
    const userId = req.user!.userId as string;
    const { species, status, trackingType } = req.query;

    const livestock = await getLivestockByFarm(farmId, userId, {
      species: species as string,
      status: status as string,
      trackingType: trackingType as string
    });

    res.status(200).json({
      success: true,
      message: "Livestock retrieved successfully",
      data: livestock
    });
  } catch (error: any) {
    logger.error("Error retrieving livestock", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to retrieve livestock"
    });
  }
};

// Get single livestock
export const getSingleLivestockController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const livestockId = req.params.livestockId as string;
    const userId = req.user!.userId as string;

    const data = await getLivestockById(livestockId, userId);

    res.status(200).json({
      success: true,
      message: "Livestock details retrieved successfully",
      data
    });
  } catch (error: any) {
    logger.error("Error retrieving livestock details", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to retrieve livestock details"
    });
  }
};

// Create livestock
export const createLivestockController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId as string;
    let bodyData = req.body;

    // Parse metadata if sent via FormData
    if (req.body.metadata) {
      try {
        bodyData = JSON.parse(req.body.metadata);
      } catch (e) {
        res.status(400).json({ success: false, message: "Invalid metadata JSON format" });
        return;
      }
    }

    // Validate
    const validationResult = createLivestockSchema.safeParse(bodyData);
    if (!validationResult.success) {
      const errors = validationResult.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message
      }));
      res.status(400).json({ success: false, message: "Validation failed", errors });
      return;
    }

    const livestock = await createLivestock(
      validationResult.data,
      userId,
      req.file?.buffer
    );

    res.status(201).json({
      success: true,
      message: "Livestock registered successfully",
      data: livestock
    });
  } catch (error: any) {
    logger.error("Error creating livestock", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to create livestock"
    });
  }
};

// Update livestock
export const updateLivestockController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const livestockId = req.params.livestockId as string;
    const userId = req.user!.userId as string;
    let bodyData = req.body;

    // Parse metadata if sent via FormData
    if (req.body.metadata) {
      try {
        bodyData = JSON.parse(req.body.metadata);
      } catch (e) {
        res.status(400).json({ success: false, message: "Invalid metadata JSON format" });
        return;
      }
    }

    // Validate
    const validationResult = updateLivestockSchema.safeParse(bodyData);
    if (!validationResult.success) {
      const errors = validationResult.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message
      }));
      res.status(400).json({ success: false, message: "Validation failed", errors });
      return;
    }

    const livestock = await updateLivestock(
      livestockId,
      userId,
      validationResult.data,
      req.file?.buffer
    );

    res.status(200).json({
      success: true,
      message: "Livestock updated successfully",
      data: livestock
    });
  } catch (error: any) {
    logger.error("Error updating livestock", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to update livestock"
    });
  }
};

// Add weight record
export const addWeightController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const livestockId = req.params.livestockId as string;
    const userId = req.user!.userId as string;

    const validationResult = addWeightSchema.safeParse(req.body);
    if (!validationResult.success) {
      const errors = validationResult.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message
      }));
      res.status(400).json({ success: false, message: "Validation failed", errors });
      return;
    }

    const livestock = await addWeightRecord(livestockId, userId, validationResult.data);

    res.status(200).json({
      success: true,
      message: "Weight recorded successfully",
      data: livestock
    });
  } catch (error: any) {
    logger.error("Error adding weight record", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to record weight"
    });
  }
};

// Delete livestock
export const deleteLivestockController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const livestockId = req.params.livestockId as string;
    const userId = req.user!.userId as string;

    const result = await deleteLivestock(livestockId, userId);

    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error: any) {
    logger.error("Error deleting livestock", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to delete livestock"
    });
  }
};

// Get livestock statistics
export const getLivestockStatsController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const farmId = req.params.farmId as string;
    const userId = req.user!.userId as string;

    const stats = await getLivestockStats(farmId, userId);

    res.status(200).json({
      success: true,
      message: "Livestock statistics retrieved successfully",
      data: stats
    });
  } catch (error: any) {
    logger.error("Error retrieving livestock stats", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to retrieve statistics"
    });
  }
};

// Get all user livestock across farms
export const getAllUserLivestockController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId as string;

    const livestock = await getAllUserLivestock(userId);

    res.status(200).json({
      success: true,
      message: "All livestock retrieved successfully",
      data: livestock
    });
  } catch (error: any) {
    logger.error("Error retrieving all user livestock", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to retrieve livestock"
    });
  }
};

// Dashboard livestock summary (across all farms)
export const getLivestockDashboardSummaryController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId as string;
    const summary = await getLivestockDashboardSummary(userId);

    res.status(200).json({
      success: true,
      message: 'Livestock dashboard summary retrieved successfully',
      data: summary
    });
  } catch (error: any) {
    logger.error('Error retrieving livestock dashboard summary', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to retrieve livestock summary'
    });
  }
};
