import { Response } from "express";
import { AuthRequest } from "../Types/auth.types";
import {
  diagnoseCrop,
  getDiagnosesByFarm,
  getDiagnosisById,
  updateDiagnosisStatus,
  sendChatMessage,
  getChatHistory,
} from "../Services/diagnosis.service";
import logger from "../Utils/logger";

export const diagnoseController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: "Crop image is required" });
      return;
    }

    const { farmId, cropType } = req.body;
    const userId = req.user!.userId as string;

    const diagnosis = await diagnoseCrop(
      farmId,
      userId,
      cropType,
      req.file.buffer,
      req.file.mimetype
    );

    res.status(201).json({
      success: true,
      message: "Crop diagnosis completed",
      data: diagnosis,
    });
  } catch (error: any) {
    logger.error("Diagnosis error", error);
    res.status(400).json({
      success: false,
      message: error.message || "Crop diagnosis failed",
    });
  }
};

export const getDiagnosesByFarmController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const farmId = Array.isArray(req.params.farmId) ? req.params.farmId[0] : req.params.farmId;
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
    const diagnosisId = Array.isArray(req.params.diagnosisId) ? req.params.diagnosisId[0] : req.params.diagnosisId;
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
    const diagnosisId = Array.isArray(req.params.diagnosisId) ? req.params.diagnosisId[0] : req.params.diagnosisId;
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
    const diagnosisId = Array.isArray(req.params.diagnosisId) ? req.params.diagnosisId[0] : req.params.diagnosisId;
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
    const diagnosisId = Array.isArray(req.params.diagnosisId) ? req.params.diagnosisId[0] : req.params.diagnosisId;
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
