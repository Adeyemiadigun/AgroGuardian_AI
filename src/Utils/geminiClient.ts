import { 
  analyzeCropImage as analyzeCropImageAIcc, 
  chatWithDiagnosis as chatWithDiagnosisAIcc, 
  getModelName as getModelNameAIcc,
  getChatModelName as getChatModelNameAIcc,
  consultWithImages as consultWithImagesAIcc 
} from './openaiClient';
import OpenAI from 'openai';
import logger from './logger';

// =============================================================================
// OpenRouter Configuration (shared with openaiClient.ts)
// =============================================================================
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

const api = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': process.env.APP_URL || 'https://agroguardian.ai',
    'X-Title': 'AgroGuardian AI',
  },
});

// Model configuration - Google Gemma 4 26B (FREE)
const VISION_MODEL = process.env.AI_VISION_MODEL || 'google/gemma-4-26b-a4b-it:free';
const CHAT_MODEL = process.env.AI_CHAT_MODEL || 'google/gemma-4-26b-a4b-it:free';
const FALLBACK_MODEL = 'openai/gpt-4o-mini';

// Helper to call API with automatic fallback
const callWithFallback = async (
  createCall: (model: string) => Promise<any>,
  primaryModel: string
): Promise<any> => {
  try {
    return await createCall(primaryModel);
  } catch (error: any) {
    if (error?.status === 429 || error?.status === 503 || error?.code === 'model_not_found') {
      logger.warn(`Primary model ${primaryModel} failed, trying fallback ${FALLBACK_MODEL}`);
      return await createCall(FALLBACK_MODEL);
    }
    throw error;
  }
};

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
export const getChatModelName = getChatModelNameAIcc;
export const consultWithImages = consultWithImagesAIcc;

/**
 * Analyze image(s) with a custom prompt - used for livestock diagnosis
 */
export const analyzeImageWithGemini = async (
  imageUrls: string[],
  prompt: string
): Promise<string> => {
  const content: any[] = [{ type: 'text', text: prompt }];

  imageUrls.forEach(url => {
    content.push({
      type: 'image_url',
      image_url: { url: url },
    });
  });

  const result = await callWithFallback(
    (model) => api.chat.completions.create({
      model,
      messages: [
        {
          role: 'user',
          content: content,
        },
      ],
    } as any),
    VISION_MODEL
  );

  return result.choices[0].message.content || '';
};

/**
 * Chat with context - generic context-aware chat function
 */
export const chatWithContext = async (
  userMessage: string,
  chatHistory: { role: 'user' | 'assistant'; content: string }[],
  systemPrompt: string
): Promise<string> => {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...chatHistory.map((msg) => ({ role: msg.role, content: msg.content })),
    { role: 'user', content: userMessage },
  ] as any[];

  const result = await callWithFallback(
    (model) => api.chat.completions.create({ model, messages }),
    CHAT_MODEL
  );

  return result.choices[0].message.content || '';
};
