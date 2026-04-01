import OpenAI from 'openai';
import logger from './logger';

const api = new OpenAI({
  baseURL: 'https://api.ai.cc/v1',
  apiKey: process.env.AICCS_API_KEY || '',
});

const DIAGNOSIS_PROMPT = `You are an expert agricultural plant pathologist and entomologist AI for AgroGuardian AI, specializing in crop disease detection and pest management for African and tropical crops.

Analyze the provided crop images and return a JSON response with the following structure:
{
  "diagnosis": "Disease name, Pest name, or 'Healthy'",
  "confidence": 85,
  "symptoms": ["Detailed observation 1", "Detailed observation 2", "Detailed observation 3", "Detailed observation 4", "Detailed observation 5"],
  "treatment": ["Comprehensive treatment step 1", "Step 2", "Step 3", "Step 4", "Step 5"],
  "treatmentPlan": [
    { 
      "task": "Specific task (e.g. Prune affected leaves, Apply 2% Neem oil)", 
      "timeframe": "e.g. ASAP, Day 1, Week 1",
      "category": "Cultural | Biological | Chemical"
    }
  ],
  "prevention": ["Prevention tip 1", "Tip 2", "Tip 3", "Tip 4", "Tip 5"],
  "severity": "low" | "medium" | "high" | "critical"
}

Rules:
- Provide a COMPREHENSIVE analysis. You must include at least 4-5 distinct, detailed items for 'symptoms', 'treatment', and 'prevention'.
- If a pest is detected, identify the specific pest and visible life stage (larva, adult, etc.).
- Treatment plans MUST follow Integrated Pest Management (IPM) principles:
  - Cultural (e.g., pruning, weeding, spacing)
  - Biological (e.g., organic sprays, beneficial insects)
  - Chemical (only as a last resort, specifying active ingredients)
- Confidence must be 0-100
- severity: low (minor/monitoring), medium (yield reduction possible), high (significant loss), critical (total crop failure risk)
- Be specific with dosages, product names (where applicable), and timing.

IMPORTANT: Return ONLY the JSON object, no markdown formatting, no code blocks, no extra text.`;

export const getModelName = (): string => {
  return 'gpt-4o-mini';
};

export const analyzeCropImage = async (
  imageUrls: string[],
  cropType: string
): Promise<any> => {
  const prompt = `${DIAGNOSIS_PROMPT}\n\nThe farmer says this is a ${cropType} crop. Analyze these images (multiple perspectives may be provided).`;

  const content: any[] = [{ type: 'text', text: prompt }];

  imageUrls.forEach(url => {
    content.push({
      type: 'image_url',
      image_url: { url: url },
    });
  });

  const result = await api.chat.completions.create({
    model: getModelName(),
    messages: [
      { role: 'system', content: DIAGNOSIS_PROMPT },
      {
        role: 'user',
        content: content,
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
    environment?: {
      temperature: number;
      humidity: number;
      weather: string;
      soilType: string;
      location: string;
    }
  }
): Promise<string> => {
  const envText = diagnosisContext.environment
    ? `\n\nCURRENT ENVIRONMENTAL CONTEXT:\n- Location: ${diagnosisContext.environment.location}\n- Weather: ${diagnosisContext.environment.weather}\n- Temp/Humidity: ${diagnosisContext.environment.temperature}Â°C / ${diagnosisContext.environment.humidity}%\n- Soil Type: ${diagnosisContext.environment.soilType}`
    : '';

  const systemPrompt = `You are an expert agricultural advisor for AgroGuardian AI. You are having a follow-up conversation about a crop disease diagnosis.\n\nPrevious diagnosis context:\n- Crop: ${diagnosisContext.cropType}\n- Disease: ${diagnosisContext.diagnosis}\n- Severity: ${diagnosisContext.severity}\n- Symptoms: ${diagnosisContext.symptoms.join(", ")}\n- Treatment: ${diagnosisContext.treatment.join(", ")}${envText}\n\nHelp the farmer with practical, actionable advice. Be conversational but informative. Consider the current weather and environment when suggesting actions (e.g., don't suggest spraying if it's about to rain). Suggest affordable and locally available solutions when possible.`;
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
