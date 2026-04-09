import CropDiagnosis from "../Models/CropDiagnosis";
import DiagnosisChat from "../Models/DiagnosisChat";
import Farm from "../Models/Farm";
import User from "../Models/User";
import WeatherData from "../Models/WeatherData";
import cloudinary from "../Config/cloudinary";
import logger from "../Utils/logger";
import { addDiagnosisJob } from "../Queues/diagnosis.queue";
import { addResilienceSyncJob } from "../Queues/resilience.queue";
import { chatWithDiagnosis } from "../Utils/geminiClient";
import { createNotification } from "./notification.service";
import { sendBrevoEmail } from "./email.service";

export const diagnoseCrop = async (
  farmId: string,
  userId: string,
  cropType: string,
  imageBuffers: Buffer[]
) => {
  const farm = await Farm.findOne({ _id: farmId, owner: userId });
  if (!farm) {
    throw new Error("Farm not found");
  }

  const uploadResults = await Promise.all(
    imageBuffers.map((buffer) => 
      new Promise<{ secure_url: string }>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "agroguardian/diagnoses", resource_type: "image" },
          (error, result) => {
            if (error || !result) return reject(error || new Error("Upload failed"));
            resolve(result);
          }
        );
        stream.end(buffer);
      })
    )
  );

  const imageUrls = uploadResults.map(r => r.secure_url);

  const diagnosis = await CropDiagnosis.create({
    farmId,
    userId,
    imageUrls,
    cropType,
    diagnosis: "Analyzing...",
    confidence: 0,
    symptoms: [],
    treatment: [],
    prevention: [],
    severity: "low",
    status: "processing",
    aiModel: "Pending...",
  });

  await addDiagnosisJob({
    diagnosisId: diagnosis._id.toString(),
    imageUrls,
    cropType,
    farmId,
    userId
  });

  logger.info(`Multi-image diagnosis initiated for farm ${farmId}. Status: processing.`);

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

  const user = await User.findById(userId);
  if (user) {
    await createNotification(
      userId,
      "Diagnosis Status Updated",
      `Your ${diagnosis.cropType} diagnosis status is now: ${status}`,
      "treatment",
      `/diagnosis?farmId=${diagnosis.farmId}`
    );

    if (status === "resolved") {
      await sendBrevoEmail(
        user.email,
        "🌱 Good News: Crop Health Resolved!",
        `<h2>Success!</h2><p>Your ${diagnosis.cropType} diagnosis has been marked as resolved. Keep up the good work!</p>`
      );
    }
  }

  logger.info(`Diagnosis ${diagnosisId} status updated to ${status}`);
  addResilienceSyncJob(diagnosis.farmId.toString(), userId);
  return diagnosis;
};

export const toggleTreatmentTask = async (
  diagnosisId: string,
  userId: string,
  taskId: string
) => {
  const diagnosis = await CropDiagnosis.findOne({ _id: diagnosisId, userId });
  if (!diagnosis) throw new Error("Diagnosis not found");

  const taskIndex = diagnosis.treatmentPlan.findIndex(t => (t as any)._id.toString() === taskId);
  if (taskIndex === -1) throw new Error("Task not found in treatment plan");

  diagnosis.treatmentPlan[taskIndex].isCompleted = !diagnosis.treatmentPlan[taskIndex].isCompleted;
  await diagnosis.save();

  const user = await User.findById(userId);
  if (user && diagnosis.treatmentPlan[taskIndex].isCompleted) {
    await createNotification(
      userId,
      "Task Completed",
      `Great job! You've completed: ${diagnosis.treatmentPlan[taskIndex].task}`,
      "treatment"
    );
  }

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
    reasoning_details: (msg as any).reasoning_details,
  }));

  const farm = await Farm.findById(diagnosis.farmId);
  const latestWeather = await WeatherData.findOne({ farmId: diagnosis.farmId }).sort({ timestamp: -1 });

  const ai = await chatWithDiagnosis(message, chatHistory, {
    cropType: diagnosis.cropType,
    diagnosis: diagnosis.diagnosis,
    severity: diagnosis.severity,
    symptoms: diagnosis.symptoms,
    treatment: diagnosis.treatment,
    environment: farm && latestWeather ? {
      temperature: latestWeather.current.temperature,
      humidity: latestWeather.current.humidity,
      weather: latestWeather.current.weatherDescription,
      soilType: farm.soilType,
      location: `${farm.location.city}, ${farm.location.country}`
    } : undefined
  });

  const aiResponse = ai.content;
  const aiReasoningDetails = ai.reasoning_details;

  chat.messages.push({ role: "assistant", content: aiResponse, reasoning_details: aiReasoningDetails, timestamp: new Date() });
  await chat.save();

  logger.info(`Chat message sent for diagnosis ${diagnosisId}`);

  return {
    userMessage: message,
    aiResponse,
    aiReasoningDetails,
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
