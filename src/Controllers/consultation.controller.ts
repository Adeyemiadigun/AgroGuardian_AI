import { Response } from "express";
import { AuthRequest } from "../Types/auth.types";
import {
  createConsultation,
  getConsultationsByFarm,
  getConsultationById,
  sendConsultationMessage,
  updateConsultationStatus,
  getAllUserConsultations,
} from "../Services/consultation.service";
import logger from "../Utils/logger";

export const createConsultationController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { farmId, cropName, cropId, seasonId, initialMessage } = req.body;
    const userId = req.user!.userId as string;

    const consultation = await createConsultation(
      farmId,
      userId,
      cropName,
      cropId,
      seasonId,
      initialMessage
    );

    logger.info("Consultation created", { consultationId: consultation._id, userId });
    res.status(201).json({
      success: true,
      message: "Consultation started successfully",
      data: consultation,
    });
  } catch (error: any) {
    logger.error("Error creating consultation", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to create consultation",
    });
  }
};

export const getConsultationsController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const farmId = (req.params.farmId as string);
    const userId = req.user!.userId as string;
    const status = req.query.status as "active" | "resolved" | "archived" | undefined;

    const consultations = await getConsultationsByFarm(farmId, userId, status);
    res.status(200).json({
      success: true,
      message: "Consultations retrieved successfully",
      data: consultations,
    });
  } catch (error: any) {
    logger.error("Error retrieving consultations", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to retrieve consultations",
    });
  }
};

export const getConsultationController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const consultationId = (req.params.consultationId as string);
    const userId = req.user!.userId as string;

    const consultation = await getConsultationById(consultationId, userId);
    res.status(200).json({
      success: true,
      message: "Consultation retrieved successfully",
      data: consultation,
    });
  } catch (error: any) {
    logger.error("Error retrieving consultation", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to retrieve consultation",
    });
  }
};

export const sendMessageController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const consultationId = (req.params.consultationId as string);
    const userId = req.user!.userId as string;
    const { message } = req.body;

    // Handle images from multer
    const files = req.files as Express.Multer.File[] | undefined;
    const imageBuffers = files?.map(file => file.buffer);

    const result = await sendConsultationMessage(
      consultationId,
      userId,
      message,
      imageBuffers
    );

    res.status(200).json({
      success: true,
      message: "Message sent successfully",
      data: result,
    });
  } catch (error: any) {
    logger.error("Error sending consultation message", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to send message",
    });
  }
};

export const updateStatusController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const consultationId = (req.params.consultationId as string);
    const userId = req.user!.userId as string;
    const { status } = req.body;

    const consultation = await updateConsultationStatus(consultationId, userId, status as any);
    res.status(200).json({
      success: true,
      message: "Consultation status updated",
      data: consultation,
    });
  } catch (error: any) {
    logger.error("Error updating consultation status", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to update status",
    });
  }
};

export const getAllConsultationsController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

    const consultations = await getAllUserConsultations(userId, limit);
    res.status(200).json({
      success: true,
      message: "All consultations retrieved",
      data: consultations,
    });
  } catch (error: any) {
    logger.error("Error retrieving all consultations", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to retrieve consultations",
    });
  }
};
