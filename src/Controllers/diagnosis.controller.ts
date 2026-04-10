import { Response } from "express";
import { AuthRequest } from "../Types/auth.types";
import {
  diagnoseCrop,
  getDiagnosesByFarm,
  getDiagnosisById,
  updateDiagnosisStatus,
  sendChatMessage,
  getChatHistory,
  toggleTreatmentTask,
} from "../Services/diagnosis.service";
import logger from "../Utils/logger";

export const diagnoseController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ success: false, message: "At least one crop image is required" });
      return;
    }

    const { farmId, cropType } = req.body;
    const userId = req.user!.userId as string;
    const imageBuffers = files.map(file => file.buffer);

    const diagnosis = await diagnoseCrop(
      farmId,
      userId,
      cropType,
      imageBuffers
    );

    logger.info("Diagnosis initiated", { diagnosisId: diagnosis._id, userId, imageCount: imageBuffers.length });
    res.status(201).json({
      success: true,
      message: "Crop diagnosis initiated. Analysis is running in the background.",
      data: diagnosis,
    });
  } catch (error: any) {
    logger.error("Diagnosis initiation error", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to initiate crop diagnosis",
    });
  }
};

export const getDiagnosesByFarmController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const farmId = (req.params.farmId as string);
    const userId = req.user!.userId as string;

    const diagnoses = await getDiagnosesByFarm(farmId, userId);
    res.status(200).json({
      success: true,
      message: "Diagnoses retrieved successfully",
      data: diagnoses,
    });
  } catch (error: any) {
    logger.error("Error retrieving diagnoses", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to retrieve diagnoses",
    });
  }
};

export const getDiagnosisController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const diagnosisId = (req.params.diagnosisId as string);
    const userId = req.user!.userId as string;

    const diagnosis = await getDiagnosisById(diagnosisId, userId);
    res.status(200).json({
      success: true,
      message: "Diagnosis retrieved successfully",
      data: diagnosis,
    });
  } catch (error: any) {
    logger.error("Error retrieving diagnosis", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to retrieve diagnosis",
    });
  }
};

export const updateStatusController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const diagnosisId = (req.params.diagnosisId as string);
    const userId = req.user!.userId as string;

    const diagnosis = await updateDiagnosisStatus(diagnosisId, userId, req.body.status);
    res.status(200).json({
      success: true,
      message: "Diagnosis status updated",
      data: diagnosis,
    });
  } catch (error: any) {
    logger.error("Error updating diagnosis status", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to update diagnosis status",
    });
  }
};

export const sendChatController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const diagnosisId = (req.params.diagnosisId as string);
    const userId = req.user!.userId as string;

    const result = await sendChatMessage(diagnosisId, userId, req.body.message);
    res.status(200).json({
      success: true,
      message: "Chat message sent",
      data: result,
    });
  } catch (error: any) {
    logger.error("Error sending chat message", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to send chat message",
    });
  }
};

export const getChatController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const diagnosisId = (req.params.diagnosisId as string);
    const userId = req.user!.userId as string;

    const chat = await getChatHistory(diagnosisId, userId);
    res.status(200).json({
      success: true,
      message: "Chat history retrieved",
      data: chat,
    });
  } catch (error: any) {
    logger.error("Error retrieving chat history", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to retrieve chat history",
    });
  }
};

export const toggleTaskController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const diagnosisId = req.params.diagnosisId as string;
      const taskId = req.params.taskId as string;
    const userId = req.user!.userId as string;

    const diagnosis = await toggleTreatmentTask(diagnosisId, userId, taskId);
    res.status(200).json({
      success: true,
      message: "Task status updated",
      data: diagnosis,
    });
  } catch (error: any) {
    logger.error("Error toggling task", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to update task status",
    });
  }
};
