import CropDiagnosis from "../Models/CropDiagnosis";
import DiagnosisChat from "../Models/DiagnosisChat";
import Farm from "../Models/Farm";
import cloudinary from "../Config/cloudinary";
import { analyzeCropImage, chatWithDiagnosis, getModelName } from "../Utils/geminiClient";
import logger from "../Utils/logger";

export const diagnoseCrop = async (
  farmId: string,
  userId: string,
  cropType: string,
  imageBuffer: Buffer,
  mimeType: string
) => {
  const farm = await Farm.findOne({ _id: farmId, owner: userId });
  if (!farm) {
    throw new Error("Farm not found");
  }

  const [uploadResult, aiResult] = await Promise.all([
    new Promise<{ secure_url: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: "agroguardian/diagnoses", resource_type: "image" },
        (error, result) => {
          if (error || !result) return reject(error || new Error("Upload failed"));
          resolve(result);
        }
      );
      stream.end(imageBuffer);
    }),
    analyzeCropImage(imageBuffer, mimeType, cropType)
  ]);

  const imageUrl = uploadResult.secure_url;

  const diagnosis = await CropDiagnosis.create({
    farmId,
    userId,
    imageUrl,
    cropType,
    diagnosis: aiResult.diagnosis,
    confidence: aiResult.confidence,
    symptoms: aiResult.symptoms,
    treatment: aiResult.treatment,
    prevention: aiResult.prevention,
    severity: aiResult.severity,
    status: "detected",
    aiModel: getModelName(),
  });

  await DiagnosisChat.create({
    diagnosisId: diagnosis._id,
    userId,
    messages: [
      {
        role: "assistant",
        content: `I've analyzed your ${cropType} image. Diagnosis: **${aiResult.diagnosis}** (${aiResult.confidence}% confidence, ${aiResult.severity} severity). You can ask me follow-up questions about treatment, prevention, or anything else.`,
        timestamp: new Date(),
      },
    ],
  });

  logger.info(`Crop diagnosis completed for farm ${farmId}: ${aiResult.diagnosis}`);

  return diagnosis;
};

export const getDiagnosesByFarm = async (farmId: string, userId: string) => {
  const farm = await Farm.findOne({ _id: farmId, owner: userId });
  if (!farm) {
    throw new Error("Farm not found");
  }

  const diagnoses = await CropDiagnosis.find({ farmId, userId }).sort({ createdAt: -1 });
  return diagnoses;
};

export const getDiagnosisById = async (diagnosisId: string, userId: string) => {
  const diagnosis = await CropDiagnosis.findOne({ _id: diagnosisId, userId });
  if (!diagnosis) {
    throw new Error("Diagnosis not found");
  }
  return diagnosis;
};

export const updateDiagnosisStatus = async (
  diagnosisId: string,
  userId: string,
  status: "detected" | "treating" | "resolved"
) => {
  const diagnosis = await CropDiagnosis.findOneAndUpdate(
    { _id: diagnosisId, userId },
    { status },
    { new: true }
  );
  if (!diagnosis) {
    throw new Error("Diagnosis not found");
  }
  logger.info(`Diagnosis ${diagnosisId} status updated to ${status}`);
  return diagnosis;
};

export const sendChatMessage = async (
  diagnosisId: string,
  userId: string,
  message: string
) => {
  const diagnosis = await CropDiagnosis.findOne({ _id: diagnosisId, userId });
  if (!diagnosis) {
    throw new Error("Diagnosis not found");
  }

  let chat = await DiagnosisChat.findOne({ diagnosisId, userId });
  if (!chat) {
    chat = await DiagnosisChat.create({ diagnosisId, userId, messages: [] });
  }

  chat.messages.push({ role: "user", content: message, timestamp: new Date() });

  const chatHistory = chat.messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));


  const aiResponse = await chatWithDiagnosis(message, chatHistory, {
    cropType: diagnosis.cropType,
    diagnosis: diagnosis.diagnosis,
    severity: diagnosis.severity,
    symptoms: diagnosis.symptoms,
    treatment: diagnosis.treatment,
  });

  chat.messages.push({ role: "assistant", content: aiResponse, timestamp: new Date() });
  await chat.save();

  logger.info(`Chat message sent for diagnosis ${diagnosisId}`);

  return {
    userMessage: message,
    aiResponse,
    totalMessages: chat.messages.length,
  };
};

export const getChatHistory = async (diagnosisId: string, userId: string) => {
  const chat = await DiagnosisChat.findOne({ diagnosisId, userId });
  if (!chat) {
    throw new Error("Chat not found for this diagnosis");
  }
  return chat;
};
