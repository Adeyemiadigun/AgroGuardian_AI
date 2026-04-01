import { analyzeCropImage as analyzeCropImageAIcc, chatWithDiagnosis as chatWithDiagnosisAIcc, getModelName as getModelNameAIcc } from './openaiClient';

export const analyzeCropImage = async (
  imageUrls: string[],
  cropType: string
): Promise<{
  diagnosis: string;
  confidence: number;
  symptoms: string[];
  treatment: string[];
  treatmentPlan: {
    task: string;
    timeframe: string;
  }[];
  prevention: string[];
  severity: "low" | "medium" | "high" | "critical";
}> => {
  return analyzeCropImageAIcc(imageUrls, cropType);
};

export const chatWithDiagnosis = chatWithDiagnosisAIcc;
export const getModelName = getModelNameAIcc;
