import Consultation from "../Models/Consultation";
import Farm from "../Models/Farm";
import CropSeason from "../Models/CropSeason";
import WeatherData from "../Models/WeatherData";
import User from "../Models/User";
import cloudinary from "../Config/cloudinary";
import {IConsultation} from "../Types/consultation.types";
import logger from "../Utils/logger";
import { consultWithImages } from "../Utils/openaiClient";
import { addResilienceSyncJob } from "../Queues/resilience.queue";
import { createNotification } from "./notification.service";

export const createConsultation = async (
  farmId: string,
  userId: string,
  cropName: string,
  cropId?: string,
  seasonId?: string,
  initialMessage?: string
): Promise<IConsultation> => {
  const farm = await Farm.findOne({ _id: farmId, owner: userId });
  if (!farm) {
    throw new Error("Farm not found");
  }

  const consultation = await Consultation.create({
    farmId,
    userId,
    cropId,
    cropName,
    seasonId,
    status: "active",
    messages: initialMessage ? [{
      role: "assistant",
      content: `Hello! I'm your AgroGuardian AI agricultural advisor. I see you're consulting about **${cropName}**. 

I'm here to help with any concerns you have - diseases, pests, nutrient issues, weather impacts, or general farming questions. 

Feel free to describe what you're experiencing or upload images of your crops for analysis. What can I help you with today?`,
      timestamp: new Date()
    }] : []
  });

  logger.info(`Consultation created for farm ${farmId}, crop ${cropName}`);
  return consultation;
};

export const getConsultationsByFarm = async (
  farmId: string,
  userId: string,
  status?: "active" | "resolved" | "archived"
): Promise<IConsultation[]> => {
  const farm = await Farm.findOne({ _id: farmId, owner: userId });
  if (!farm) {
    throw new Error("Farm not found");
  }

  const query: any = { farmId, userId };
  if (status) query.status = status;

  const consultations = await Consultation.find(query)
    .sort({ updatedAt: -1 })
    .select("-messages"); // Don't load full messages for list

  return consultations;
};

export const getConsultationById = async (
  consultationId: string,
  userId: string
): Promise<IConsultation> => {
  const consultation = await Consultation.findOne({ _id: consultationId, userId });
  if (!consultation) {
    throw new Error("Consultation not found");
  }
  return consultation;
};

export const sendConsultationMessage = async (
  consultationId: string,
  userId: string,
  message: string,
  imageBuffers?: Buffer[]
): Promise<{ consultation: IConsultation; aiResponse: string }> => {
  const consultation = await Consultation.findOne({ _id: consultationId, userId });
  if (!consultation) {
    throw new Error("Consultation not found");
  }

  // Upload images if provided
  let imageUrls: string[] = [];
  if (imageBuffers && imageBuffers.length > 0) {
    const uploadResults = await Promise.all(
      imageBuffers.map((buffer) =>
        new Promise<{ secure_url: string }>((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: "agroguardian/consultations", resource_type: "image" },
            (error, result) => {
              if (error || !result) return reject(error || new Error("Upload failed"));
              resolve(result);
            }
          );
          stream.end(buffer);
        })
      )
    );
    imageUrls = uploadResults.map(r => r.secure_url);
  }

  // Add user message
  consultation.messages.push({
    role: "user",
    content: message,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    timestamp: new Date()
  });

  // Get farm and weather context
  const farm = await Farm.findById(consultation.farmId);
  const weather = await WeatherData.findOne({ farmId: consultation.farmId }).sort({ timestamp: -1 });
  
  // Get season info if available
  let seasonInfo: string | undefined;
  if (consultation.seasonId) {
    const season = await CropSeason.findById(consultation.seasonId);
    if (season) {
      seasonInfo = `Planted ${new Date(season.plantedDate).toLocaleDateString()}, ${season.area} ${season.areaUnit}`;
    }
  }

  // Build chat history for AI
  const chatHistory = consultation.messages.slice(-10).map(msg => ({
    role: msg.role as "user" | "assistant",
    content: msg.content,
    imageUrls: msg.imageUrls
  }));

  // Get AI response
  const aiResult = await consultWithImages(
    message,
    imageUrls,
    chatHistory.slice(0, -1), // Exclude current message (we send it separately)
    {
      cropName: consultation.cropName,
      farmLocation: farm ? `${farm.location.city}, ${farm.location.country}` : undefined,
      soilType: farm?.soilType?.join(", "),
      irrigationType: farm?.irrigationType,
      seasonInfo,
      weather: weather ? {
        temperature: weather.current.temperature,
        humidity: weather.current.humidity,
        description: weather.current.weatherDescription
      } : undefined
    }
  );

  // Add AI response
  consultation.messages.push({
    role: "assistant",
    content: aiResult.response,
    timestamp: new Date()
  });

  // Update consultation metadata from AI analysis
  const isNewIssue = !consultation.issueType && aiResult.issueType;
  const isNewSeverity = !consultation.severity && aiResult.severity;
  
  if (aiResult.issueType && !consultation.issueType) {
    consultation.issueType = aiResult.issueType as any;
  }
  if (aiResult.severity && !consultation.severity) {
    consultation.severity = aiResult.severity as any;
  }
  if (aiResult.suggestedTitle && !consultation.title) {
    consultation.title = aiResult.suggestedTitle;
  }

  await consultation.save();

  // Sync with resilience engine if a significant issue is detected
  if (isNewIssue || isNewSeverity) {
    if (aiResult.severity === 'high' || aiResult.severity === 'critical') {
      addResilienceSyncJob(consultation.farmId.toString(), userId);
      
      // Create notification for high severity
      await createNotification(
        userId,
        `${aiResult.severity === 'critical' ? '🚨 Critical' : '⚠️ High'} Issue Detected`,
        `AI detected a ${aiResult.severity} severity ${aiResult.issueType || 'issue'} in your ${consultation.cropName}. Check the consultation for recommended actions.`,
        "alert",
        `/diagnosis?farmId=${consultation.farmId}`
      );
    }
  }

  logger.info(`Consultation message sent for ${consultationId}, images: ${imageUrls.length}`);

  return { consultation, aiResponse: aiResult.response };
};

export const updateConsultationStatus = async (
  consultationId: string,
  userId: string,
  status: "active" | "resolved" | "archived"
): Promise<IConsultation> => {
  const consultation = await Consultation.findOneAndUpdate(
    { _id: consultationId, userId },
    { status },
    { new: true }
  );
  if (!consultation) {
    throw new Error("Consultation not found");
  }

  // Sync with resilience engine when status changes
  addResilienceSyncJob(consultation.farmId.toString(), userId);

  // Create notification for status change
  const user = await User.findById(userId);
  if (user) {
    if (status === "resolved") {
      await createNotification(
        userId,
        "Consultation Resolved",
        `Your ${consultation.cropName} consultation has been marked as resolved. Great job addressing the issue!`,
        "treatment",
        `/diagnosis?farmId=${consultation.farmId}`
      );
    }
  }

  logger.info(`Consultation ${consultationId} status updated to ${status}`);
  return consultation;
};

export const getAllUserConsultations = async (
  userId: string,
  limit: number = 20
): Promise<IConsultation[]> => {
  const consultations = await Consultation.find({ userId })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .select("-messages")
    .populate("farmId", "name location");

  return consultations;
};
