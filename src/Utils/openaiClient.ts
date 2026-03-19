import OpenAI from 'openai';
import logger from './logger';

const api = new OpenAI({
  baseURL: 'https://api.ai.cc/v1',
  apiKey: process.env.AICCS_API_KEY || '',
});

const DIAGNOSIS_PROMPT = `You are an expert agricultural plant pathologist AI for AgroGuardian AI, specializing in crop disease detection for African and tropical crops.

Analyze the provided crop image and return a JSON response with the following structure:
{
  "diagnosis": "Disease name or 'Healthy'",
  "confidence": 85,
  "symptoms": ["symptom 1", "symptom 2"],
  "treatment": ["treatment step 1", "treatment step 2"],
  "prevention": ["prevention tip 1", "prevention tip 2"],
  "severity": "low" | "medium" | "high" | "critical"
}

Rules:
- If the image is not a plant/crop, return: { "diagnosis": "Invalid image", "confidence": 0, "symptoms": [], "treatment": [], "prevention": [], "severity": "low" }
- Confidence must be 0-100
- Treatments should be practical and accessible for small-scale farmers
- Include both organic and chemical treatment options when applicable
- severity: low (minor cosmetic damage), medium (yield reduction likely), high (significant crop loss), critical (total crop failure risk)
- Be specific with product names and dosages where possible

IMPORTANT: Return ONLY the JSON object, no markdown formatting, no code blocks, no extra text.`;

export const getModelName = (): string => {
  return 'gpt-4o-mini';
};

export const analyzeCropImage = async (
  imageBase64: string,
  cropType: string
): Promise<any> => {
  const prompt = `${DIAGNOSIS_PROMPT}\n\nThe farmer says this is a ${cropType} crop. Analyze the image.`;
  const result = await api.chat.completions.create({
    model: getModelName(),
    messages: [
      { role: 'system', content: DIAGNOSIS_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${imageBase64}`,
            },
          },
        ],
      },
    ],
    response_format: { type: 'json_object' },
  } as any);
  const message = result.choices[0].message.content;
  try {
    return JSON.parse(message || '{}');
  } catch {
    logger.error('Failed to parse AI response:', message);
    throw new Error('Failed to parse AI diagnosis response');
  }
};

const VERIFICATION_PROMPT = `You are an expert agricultural auditor for AgroGuardian AI.
Analyze the provided farm image and determine if it shows evidence of a specific regenerative practice.

Return a JSON response:
{
  "isVerified": true | false,
  "confidence": 0-100,
  "observations": "Brief description of what you see",
  "reasoning": "Why you reached this conclusion"
}

Practice to verify: `;

export const verifyPracticeImage = async (
  imageBase64: string,
  practiceName: string
): Promise<any> => {
  const prompt = `${VERIFICATION_PROMPT} "${practiceName}". Does the image show evidence of this practice?`;
  const result = await api.chat.completions.create({
    model: getModelName(),
    messages: [
      { role: 'system', content: VERIFICATION_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${imageBase64}`,
            },
          },
        ],
      },
    ],
    response_format: { type: 'json_object' },
  } as any);
  const message = result.choices[0].message.content;
  try {
    return JSON.parse(message || '{}');
  } catch {
    logger.error('Failed to parse AI verification response:', message);
    throw new Error('Failed to parse AI verification response');
  }
};

export const chatWithDiagnosis = async (
  userMessage: string,
  chatHistory: { role: 'user' | 'assistant'; content: string }[],
  diagnosisContext: {
    cropType: string;
    diagnosis: string;
    severity: string;
    symptoms: string[];
    treatment: string[];
  }
): Promise<string> => {
  const systemPrompt = `You are an expert agricultural advisor for AgroGuardian AI. You are having a follow-up conversation about a crop disease diagnosis.\n\nPrevious diagnosis context:\n- Crop: ${diagnosisContext.cropType}\n- Disease: ${diagnosisContext.diagnosis}\n- Severity: ${diagnosisContext.severity}\n- Symptoms: ${diagnosisContext.symptoms.join(", ")}\n- Treatment: ${diagnosisContext.treatment.join(", ")}\n\nHelp the farmer with practical, actionable advice. Be conversational but informative. Consider that many farmers are small-scale with limited resources. Suggest affordable and locally available solutions when possible.`;
  const messages = [
    { role: 'system', content: systemPrompt },
    ...chatHistory.map((msg) => ({ role: msg.role, content: msg.content })),
    { role: 'user', content: userMessage },
  ] as any[];
  const result = await api.chat.completions.create({
    model: getModelName(),
    messages,
  });
  return result.choices[0].message.content || '';
};
