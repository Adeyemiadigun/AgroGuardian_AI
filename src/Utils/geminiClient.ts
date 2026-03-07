import { analyzeCropImage as analyzeCropImageAIcc, chatWithDiagnosis as chatWithDiagnosisAIcc, getModelName as getModelNameAIcc } from './openaiClient';

export const analyzeCropImage = async (
  imageBuffer: Buffer,
  _mimeType: string,
  cropType: string
): Promise<{
  diagnosis: string;
  confidence: number;
  symptoms: string[];
  treatment: string[];
  prevention: string[];
  severity: "low" | "medium" | "high" | "critical";
}> => {
  const imageBase64 = imageBuffer.toString('base64');
  return analyzeCropImageAIcc(imageBase64, cropType);
};

export const chatWithDiagnosis = chatWithDiagnosisAIcc;
export const getModelName = getModelNameAIcc;
