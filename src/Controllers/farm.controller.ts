import { Response } from "express";
import { AuthRequest } from "../Types/auth.types";
import {  createFarm,  getFarmsByOwner,  getFarmById,  updateFarm,  deleteFarm,} from "../Services/farm.service";
import logger from "../Utils/logger";

export const createFarmController = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const farm = await createFarm(req.body, req.user!.userId);
        res.status(201).json({ 
            success: true, 
            message: "Farm created successfully",
            data: farm 
        });
    } catch (error: any) {
        logger.error("Farm creation error", error);
        res.status(400).json({ 
            success: false, 
            message: error.message || "Farm creation failed" 
        });
    }
}

export const getAllFarms = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const farms = await getFarmsByOwner(req.user!.userId);
        res.status(200).json({ 
            success: true, 
            message: "Farms retrieved successfully", 
            data: farms 
        });
    } catch (error: any) {
        logger.error("Error retrieving farms", error);
        res.status(400).json({ 
            success: false, 
            message: error.message || "Failed to retrieve farms" }
        );
    }
}

export const getFarm = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const farmId = Array.isArray(req.params.farmId) ? req.params.farmId[0] : req.params.farmId;
        const farm = await getFarmById(farmId, req.user!.userId);
        res.status(200).json({ 
            success: true, 
            message: "Farm retrieved successfully", 
            data: farm 
        });
    } catch (error: any) {
        logger.error("Error retrieving farm", error);
        res.status(400).json({ 
            success: false, 
            message: error.message || "Failed to retrieve farm" }
        );
    }
}

export const updateFarmController = async (req: AuthRequest, res: Response): Promise<void> => {
    try {        
        const farmId = Array.isArray(req.params.farmId) ? req.params.farmId[0] : req.params.farmId;
        const updatedFarm = await updateFarm(farmId, req.user!.userId, req.body);
        res.status(200).json({ 
            success: true, 
            message: "Farm updated successfully", 
            data: updatedFarm 
        });
    } catch (error: any) {
        logger.error("Error updating farm", error);
        res.status(400).json({ 
            success: false, 
            message: error.message || "Failed to update farm" 
        });
    }
}

export const deleteFarmController = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const farmId = Array.isArray(req.params.farmId) ? req.params.farmId[0] : req.params.farmId;
        const userId = req.user!.userId as string;
        const result = await deleteFarm(farmId, userId);
        res.status(200).json({ 
            success: true, 
            ...result 
        });
    } catch (error: any) {
        logger.error("Error deleting farm", error);
        res.status(400).json({ 
            success: false, 
            message: error.message || "Failed to delete farm" 
        });
    }
}
