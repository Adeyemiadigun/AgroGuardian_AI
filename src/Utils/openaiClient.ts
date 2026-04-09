import OpenAI from 'openai';
import logger from './logger';

// =============================================================================
// OpenRouter Configuration
// =============================================================================
// Using OpenRouter for access to multiple AI models with a single API
// Sign up at https://openrouter.ai to get your API key
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

// =============================================================================
// Model Configuration
// =============================================================================
// Default to GPT-4o mini (better general reliability/quality).
// You can override at runtime via AI_VISION_MODEL / AI_CHAT_MODEL.
// =============================================================================

// Primary model for vision/diagnosis tasks
const VISION_MODEL = process.env.AI_VISION_MODEL || 'openai/gpt-4o-mini';

// Model for text-only chat
const CHAT_MODEL = process.env.AI_CHAT_MODEL || 'openai/gpt-4o-mini';

// Token caps (prevents OpenRouter 402 when defaults are too high)
const CHAT_MAX_TOKENS = Number(process.env.AI_CHAT_MAX_TOKENS || process.env.AI_MAX_TOKENS || 2048);
const VISION_MAX_TOKENS = Number(process.env.AI_VISION_MAX_TOKENS || process.env.AI_MAX_TOKENS || 2048);

// Fallback model(s) if primary fails (comma-separated, highest priority first)
const FALLBACK_MODELS = (
  process.env.AI_FALLBACK_MODELS ||
  process.env.AI_FALLBACK_MODEL ||
  'google/gemini-2.5-flash,google/gemini-2.5-pro,google/gemma-3-12b-it:free'
)
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

export const getModelName = (): string => {
  return VISION_MODEL;
};

export const getChatModelName = (): string => {
  return CHAT_MODEL;
};

const REASONING_ENABLED = String(process.env.AI_REASONING_ENABLED || '').toLowerCase() === 'true';

const withReasoning = (payload: any) => {
  if (!REASONING_ENABLED) return payload;
  return { ...payload, reasoning: { enabled: true } };
};

const shouldAttemptFallback = (error: any): boolean => {
  const status = error?.status;
  const code = error?.code;
  // OpenRouter often returns 404 for unavailable models: "No endpoints found for <model>"
  // 402 may happen when credits are insufficient for a given model/max_tokens; try cheaper fallbacks.
  return status === 402 || status === 404 || status === 429 || status === 503 || code === 'model_not_found';
};

const getHeader = (headers: any, name: string): string | undefined => {
  if (!headers) return undefined;
  const key = String(name || '').toLowerCase();
  for (const k of Object.keys(headers)) {
    if (String(k).toLowerCase() === key) return headers[k];
  }
  return undefined;
};

const summarizeLlmError = (error: any) => {
  const headers = error?.headers || error?.response?.headers;

  const requestId =
    getHeader(headers, 'x-request-id') ||
    getHeader(headers, 'x-requestid') ||
    getHeader(headers, 'cf-ray');

  const retryAfter = getHeader(headers, 'retry-after');

  const rateLimit = {
    limit: getHeader(headers, 'x-ratelimit-limit') || getHeader(headers, 'x-ratelimit-limit-requests'),
    remaining: getHeader(headers, 'x-ratelimit-remaining') || getHeader(headers, 'x-ratelimit-remaining-requests'),
    reset: getHeader(headers, 'x-ratelimit-reset') || getHeader(headers, 'x-ratelimit-reset-requests'),
  };

  const providerMessage =
    error?.error?.message ||
    error?.response?.data?.error?.message ||
    error?.response?.data?.message;

  const providerMetadata = error?.error?.metadata || error?.response?.data?.error?.metadata;

  return {
    status: error?.status,
    code: error?.code,
    type: error?.type,
    message: error?.message,
    providerMessage,
    providerMetadata,
    requestId,
    retryAfter,
    rateLimit,
  };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RETRY_MAX = Number(process.env.AI_RETRY_MAX || 2);
const RETRY_BASE_MS = Number(process.env.AI_RETRY_BASE_MS || 500);

// If a primary model is consistently rate-limited upstream (429), skip it briefly.
const PRIMARY_COOLDOWN_MS = Number(process.env.AI_PRIMARY_COOLDOWN_MS || 30_000);
const primaryCooldownUntil = new Map<string, number>();

const LOG_LLM_USAGE = String(process.env.AI_LOG_LLM_USAGE || '').toLowerCase() === 'true';
const summarizeUsage = (usage: any) => {
  if (!usage) return undefined;
  return {
    promptTokens: usage.prompt_tokens ?? usage.promptTokens,
    completionTokens: usage.completion_tokens ?? usage.completionTokens,
    totalTokens: usage.total_tokens ?? usage.totalTokens,
    reasoningTokens: usage.reasoning_tokens ?? usage.reasoningTokens,
  };
};
const logUsage = (model: string, result: any) => {
  if (!LOG_LLM_USAGE) return;
  const u = summarizeUsage(result?.usage);
  if (!u) return;
  logger.debug('LLM usage', { model, ...u });
};

// Helper to call API with automatic fallback
const callWithFallback = async (
  createCall: (model: string) => Promise<any>,
  primaryModel: string
): Promise<any> => {
  // Circuit breaker: if primary is cooling down, skip straight to fallbacks
  const cooldown = primaryCooldownUntil.get(primaryModel);
  if (cooldown && Date.now() < cooldown) {
    logger.warn('Primary model in cooldown; skipping to fallbacks', {
      primaryModel,
      cooldownMsRemaining: cooldown - Date.now(),
      fallbacks: FALLBACK_MODELS,
    });

    let lastErr: any;
    for (const fallbackModel of FALLBACK_MODELS) {
      if (!fallbackModel || fallbackModel === primaryModel) continue;
      try {
        const res = await createCall(fallbackModel);
        logUsage(fallbackModel, res);
        return res;
      } catch (e: any) {
        lastErr = e;
        const s2 = summarizeLlmError(e);
        logger.warn('Fallback model failed during cooldown; trying next', { primaryModel, fallbackModel, ...s2 });
        continue;
      }
    }
    throw lastErr;
  }

  // Retry primary on transient throttling before falling back
  for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
    try {
      const res = await createCall(primaryModel);
      logUsage(primaryModel, res);
      return res;
    } catch (error: any) {
      const summary = summarizeLlmError(error);
      const status = error?.status;

      const upstreamRaw = String((summary as any)?.providerMetadata?.raw || '').toLowerCase();
      if ((status === 429 || status === 503) && upstreamRaw.includes('rate-limit')) {
        primaryCooldownUntil.set(primaryModel, Date.now() + PRIMARY_COOLDOWN_MS);
      }

      const retryAfterSec = summary?.retryAfter ? Number(summary.retryAfter) : NaN;
      const waitMs = Number.isFinite(retryAfterSec)
        ? Math.max(0, retryAfterSec * 1000)
        : Math.min(8000, RETRY_BASE_MS * Math.pow(2, attempt));

      // Only retry on transient throttling/capacity
      const retryable = status === 429 || status === 503;
      const isLastAttempt = attempt >= RETRY_MAX;

      if (retryable && !isLastAttempt) {
        logger.warn('LLM primary model throttled; retrying', {
          primaryModel,
          attempt: attempt + 1,
          waitMs,
          ...summary,
        });
        await sleep(waitMs + Math.floor(Math.random() * 250));
        continue;
      }

      // If not fallbackable (e.g. 401), stop here
      if (!shouldAttemptFallback(error) || FALLBACK_MODELS.length === 0) {
        logger.error('LLM request failed (no fallback attempted)', { primaryModel, ...summary });
        throw error;
      }

      logger.warn('Primary model failed; trying fallbacks', {
        primaryModel,
        fallbacks: FALLBACK_MODELS,
        ...summary,
      });

      let lastErr: any = error;

      for (const fallbackModel of FALLBACK_MODELS) {
        if (!fallbackModel || fallbackModel === primaryModel) continue;

        try {
          const res = await createCall(fallbackModel);
          logUsage(fallbackModel, res);
          return res;
        } catch (e: any) {
          lastErr = e;
          const s2 = summarizeLlmError(e);

          if (shouldAttemptFallback(e)) {
            logger.warn('Fallback model failed; trying next', {
              primaryModel,
              fallbackModel,
              ...s2,
            });
            continue;
          }

          logger.error('Fallback model failed (non-fallbackable error)', {
            primaryModel,
            fallbackModel,
            ...s2,
          });
          throw e;
        }
      }

      logger.error('All fallback models failed', {
        primaryModel,
        fallbacks: FALLBACK_MODELS,
        ...summarizeLlmError(lastErr),
      });

      throw lastErr;
    }
  }

  // Should be unreachable
  const res = await createCall(primaryModel);
  logUsage(primaryModel, res);
  return res;
};

const DIAGNOSIS_PROMPT = `You are an expert agricultural plant pathologist and entomologist AI for AgroGuardian AI, specializing in crop disease detection and pest management for African and tropical crops.

Analyze the provided crop images and return a JSON response with the following structure:
{
  "diagnosis": "Disease name, Pest name, or 'Healthy'",
  "confidence": 85,
  "imageQuality": "good" | "fair" | "poor",
  "imageQualityIssues": ["Optional: describe any image quality issues like blur, poor lighting, etc."],
  "symptoms": ["Detailed observation 1", "Detailed observation 2", "Detailed observation 3", "Detailed observation 4", "Detailed observation 5"],
  "affectedArea": "Estimate percentage of visible crop affected (e.g., '30-40%')",
  "spreadRisk": "low" | "medium" | "high",
  "spreadRiskReason": "Brief explanation of why it might spread",
  "treatment": ["Comprehensive treatment step 1", "Step 2", "Step 3", "Step 4", "Step 5"],
  "treatmentPlan": [
    { 
      "task": "Specific task (e.g. Prune affected leaves, Apply 2% Neem oil)", 
      "timeframe": "e.g. ASAP, Day 1-2, Week 1",
      "category": "Cultural | Biological | Chemical",
      "estimatedCost": "e.g. ₦2,000-3,000 or $5-10",
      "priority": "critical | high | medium | low"
    }
  ],
  "totalEstimatedCost": {
    "min": 5000,
    "max": 15000,
    "currency": "NGN",
    "notes": "Cost breakdown explanation"
  },
  "yieldImpact": {
    "withoutTreatment": "e.g. 60-80% yield loss expected",
    "withTreatment": "e.g. 5-10% yield loss if treated promptly",
    "economicBenefit": "Treating saves approximately ₦X per hectare"
  },
  "weatherConsiderations": {
    "optimalSprayConditions": "e.g. Dry weather, wind < 10km/h, early morning or evening",
    "rainWarning": "Do not spray if rain expected within 6 hours",
    "temperatureRange": "e.g. Best applied at 20-28°C"
  },
  "prevention": ["Prevention tip 1", "Tip 2", "Tip 3", "Tip 4", "Tip 5"],
  "severity": "low" | "medium" | "high" | "critical",
  "urgency": "immediate" | "within_24h" | "within_week" | "monitoring",
  "similarCases": "This appears similar to common [disease] outbreaks seen in [region/season]",
  "localRemedies": ["Any traditional/local remedies that may help as first aid"]
}

Rules:
- Provide a COMPREHENSIVE analysis. You must include at least 4-5 distinct, detailed items for 'symptoms', 'treatment', and 'prevention'.
- If a pest is detected, identify the specific pest and visible life stage (larva, adult, etc.).
- ALWAYS assess image quality and mention if images are too blurry, dark, or unclear for accurate diagnosis.
- Treatment plans MUST follow Integrated Pest Management (IPM) principles:
  - Cultural (e.g., pruning, weeding, spacing)
  - Biological (e.g., organic sprays, beneficial insects)
  - Chemical (only as a last resort, specifying active ingredients and safety precautions)
- Confidence must be 0-100 (be conservative - if image is unclear, reduce confidence)
- Include realistic cost estimates in Nigerian Naira (₦) or USD
- Consider that this is for smallholder farmers - prioritize affordable solutions
- severity: low (minor/monitoring), medium (yield reduction possible), high (significant loss), critical (total crop failure risk)
- Be specific with dosages, product names (where applicable), timing, and safety equipment needed.

IMPORTANT: Return ONLY valid JSON. No markdown code blocks, no backticks, no extra text before or after the JSON.`;

// Helper to extract JSON from response (handles markdown code blocks)
const extractJSON = (text: string): any => {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Try to extract from markdown code block
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1].trim());
    }
    // Try to find JSON object in text
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return JSON.parse(objectMatch[0]);
    }
    throw new Error('No valid JSON found in response');
  }
};

export const analyzeCropImage = async (
  imageUrls: string[],
  cropType: string,
  farmContext?: {
    location?: string;
    soilType?: string;
    irrigationType?: string;
    farmSize?: number;
    farmSizeUnit?: string;
  }
): Promise<any> => {
  let contextInfo = `The farmer says this is a ${cropType} crop.`;
  if (farmContext) {
    contextInfo += '\n\nFARM CONTEXT:';
    if (farmContext.location) contextInfo += `\n- Location: ${farmContext.location}`;
    if (farmContext.soilType) contextInfo += `\n- Soil Type: ${farmContext.soilType}`;
    if (farmContext.irrigationType) contextInfo += `\n- Irrigation: ${farmContext.irrigationType}`;
    if (farmContext.farmSize) contextInfo += `\n- Farm Size: ${farmContext.farmSize} ${farmContext.farmSizeUnit || 'hectares'}`;
    contextInfo += '\n\nConsider these factors when making treatment recommendations and cost estimates.';
  }

  const prompt = `${DIAGNOSIS_PROMPT}\n\n${contextInfo}\n\nAnalyze these ${imageUrls.length} image(s) (multiple perspectives may be provided).`;

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
      max_tokens: VISION_MAX_TOKENS,
      messages: [
        { role: 'system', content: DIAGNOSIS_PROMPT },
        { role: 'user', content: content },
      ],
    } as any),
    VISION_MODEL
  );

  const message = result.choices[0].message.content;
  try {
    const parsed = extractJSON(message || '{}');
    
    // Add low confidence warning
    if (parsed.confidence && parsed.confidence < 70) {
      parsed.lowConfidenceWarning = `⚠️ Confidence is ${parsed.confidence}%. Consider uploading clearer images or consulting a local agricultural extension officer for verification.`;
    }
    
    // Add critical severity warning
    if (parsed.severity === 'critical') {
      parsed.criticalWarning = '🚨 CRITICAL: Immediate action required to prevent total crop loss. Contact local agricultural office if possible.';
    }
    
    return parsed;
  } catch (e) {
    logger.error('Failed to parse AI response:', message);
    throw new Error('Failed to parse AI diagnosis response');
  }
};

const VERIFICATION_PROMPT = `You are an expert agricultural auditor for AgroGuardian AI.
Analyze the provided farm image and determine if it shows evidence of a specific regenerative practice.

Return ONLY a JSON response (no markdown, no extra text):
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
  const prompt = `${VERIFICATION_PROMPT} "${practiceName}". Does the image show evidence of this practice? Return ONLY valid JSON.`;
  
  const result = await callWithFallback(
    (model) => api.chat.completions.create({
      model,
      max_tokens: VISION_MAX_TOKENS,
      messages: [
        { role: 'system', content: 'You are an agricultural verification assistant. Always respond with valid JSON only.' },
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
    } as any),
    VISION_MODEL
  );
  
  const message = result.choices[0].message.content;
  try {
    return extractJSON(message || '{}');
  } catch {
    logger.error('Failed to parse AI verification response:', message);
    throw new Error('Failed to parse AI verification response');
  }
};

export const chatWithDiagnosis = async (
  userMessage: string,
  chatHistory: { role: 'user' | 'assistant'; content: string; reasoning_details?: any }[],
  diagnosisContext: {
    cropType: string;
    diagnosis: string;
    severity: string;
    symptoms: string[];
    treatment: string[];
    treatmentPlan?: { task: string; timeframe: string; category: string; estimatedCost?: string }[];
    totalEstimatedCost?: { min: number; max: number; currency: string };
    environment?: {
      temperature: number;
      humidity: number;
      weather: string;
      soilType: string;
      location: string;
      forecast?: string;
    }
  }
): Promise<{ content: string; reasoning_details?: any }> => {
  const envText = diagnosisContext.environment
    ? `\n\nCURRENT ENVIRONMENTAL CONTEXT:
- Location: ${diagnosisContext.environment.location}
- Weather Now: ${diagnosisContext.environment.weather}
- Temperature: ${diagnosisContext.environment.temperature}°C
- Humidity: ${diagnosisContext.environment.humidity}%
- Soil Type: ${diagnosisContext.environment.soilType}
${diagnosisContext.environment.forecast ? `- Forecast: ${diagnosisContext.environment.forecast}` : ''}`
    : '';

  const costText = diagnosisContext.totalEstimatedCost
    ? `\n- Estimated Treatment Cost: ${diagnosisContext.totalEstimatedCost.currency} ${diagnosisContext.totalEstimatedCost.min.toLocaleString()}-${diagnosisContext.totalEstimatedCost.max.toLocaleString()}`
    : '';

  const systemPrompt = `You are AgroGuardian AI's expert agricultural advisor - think of yourself as a friendly, knowledgeable extension officer who speaks the farmer's language.

DIAGNOSIS CONTEXT:
- Crop: ${diagnosisContext.cropType}
- Disease/Issue: ${diagnosisContext.diagnosis}
- Severity: ${diagnosisContext.severity.toUpperCase()}
- Key Symptoms: ${diagnosisContext.symptoms.slice(0, 3).join("; ")}
- Recommended Treatment: ${diagnosisContext.treatment.slice(0, 3).join("; ")}${costText}${envText}

YOUR ROLE:
1. Answer the farmer's questions clearly and simply
2. ALWAYS consider current weather before suggesting treatments:
   - If rain is coming: "Wait until after the rain to spray"
   - If it's very hot: "Apply treatment early morning or evening"
   - If windy: "Wait for calmer conditions for spraying"
3. Provide AFFORDABLE alternatives when possible (local remedies, organic options)
4. Be encouraging - farming is hard, acknowledge their efforts
5. If they ask about costs, provide realistic estimates in local currency (₦ for Nigeria)
6. Warn them about safety when discussing pesticides (gloves, masks, etc.)
7. If unsure, recommend consulting local agricultural extension office

RESPONSE STYLE:
- Be conversational but informative
- Use simple language, avoid too much jargon
- Give specific, actionable advice
- Keep responses focused and practical
- If the question is unrelated to farming, politely redirect to agricultural topics`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...chatHistory.map((msg) => {
      const base: any = { role: msg.role, content: msg.content };
      if (msg.role === 'assistant' && (msg as any).reasoning_details) {
        base.reasoning_details = (msg as any).reasoning_details;
      }
      return base;
    }),
    { role: 'user', content: userMessage },
  ] as any[];
  
  const result = await callWithFallback(
    (model) => api.chat.completions.create(withReasoning({ model, max_tokens: CHAT_MAX_TOKENS, messages }) as any),
    CHAT_MODEL
  );
  
  const assistantMsg = result.choices[0].message as any;
  return {
    content: assistantMsg?.content || '',
    reasoning_details: assistantMsg?.reasoning_details,
  };
};

export const chatWithImagesDetailed = async (
  systemPrompt: string,
  userMessage: string,
  imageUrls: string[],
  chatHistory: { role: 'user' | 'assistant'; content: string; imageUrls?: string[]; reasoning_details?: any }[]
): Promise<{ content: string; reasoning_details?: any }> => {
  const messages: any[] = [{ role: 'system', content: systemPrompt }];

  for (const msg of chatHistory) {
    if (msg.role === 'user' && msg.imageUrls && msg.imageUrls.length > 0) {
      const content: any[] = [{ type: 'text', text: msg.content }];
      msg.imageUrls.forEach(url => {
        content.push({ type: 'image_url', image_url: { url } });
      });
      messages.push({ role: 'user', content });
      continue;
    }

    let cleanContent = msg.content;
    if (msg.role === 'assistant' && cleanContent.includes('|||METADATA|||')) {
      cleanContent = cleanContent.split('|||METADATA|||')[0].trim();
    }

    const baseMsg: any = { role: msg.role, content: cleanContent };
    if (msg.role === 'assistant' && (msg as any).reasoning_details) {
      baseMsg.reasoning_details = (msg as any).reasoning_details;
    }
    messages.push(baseMsg);
  }

  if (imageUrls && imageUrls.length > 0) {
    const content: any[] = [{ type: 'text', text: userMessage }];
    imageUrls.forEach(url => {
      content.push({ type: 'image_url', image_url: { url } });
    });
    messages.push({ role: 'user', content });
  } else {
    messages.push({ role: 'user', content: userMessage });
  }

  const hasImages = !!(imageUrls && imageUrls.length > 0);
  const modelToUse = hasImages ? VISION_MODEL : CHAT_MODEL;
  const max_tokens = hasImages ? VISION_MAX_TOKENS : CHAT_MAX_TOKENS;
  const result = await callWithFallback(
    (model) => api.chat.completions.create(withReasoning({ model, max_tokens, messages }) as any),
    modelToUse
  );

  const assistantMsg = result.choices[0].message as any;
  return {
    content: assistantMsg?.content || '',
    reasoning_details: assistantMsg?.reasoning_details,
  };
};

// Consultation chat with image support - for general crop concerns without diagnosis
export const consultWithImages = async (
  userMessage: string,
  imageUrls: string[],
  chatHistory: { role: 'user' | 'assistant'; content: string; imageUrls?: string[]; reasoning_details?: any }[],
  context: {
    cropName: string;
    farmLocation?: string;
    soilType?: string;
    irrigationType?: string;
    seasonInfo?: string;
    weather?: {
      temperature: number;
      humidity: number;
      description: string;
    };
  }
): Promise<{ response: string; issueType?: string; severity?: string; suggestedTitle?: string; reasoning_details?: any }> => {
  
  const envText = context.weather
    ? `\n- Current Weather: ${context.weather.description}, ${context.weather.temperature}°C, ${context.weather.humidity}% humidity`
    : '';

  const systemPrompt = `You are AgroGuardian AI's expert crop consultation assistant - a friendly, knowledgeable agricultural extension officer available 24/7.

CONSULTATION CONTEXT:
- Crop: ${context.cropName}
${context.farmLocation ? `- Location: ${context.farmLocation}` : ''}
${context.soilType ? `- Soil Type: ${context.soilType}` : ''}
${context.irrigationType ? `- Irrigation: ${context.irrigationType}` : ''}
${context.seasonInfo ? `- Season Info: ${context.seasonInfo}` : ''}${envText}

YOUR ROLE:
1. Listen carefully to the farmer's concern or question
2. If images are provided, analyze them thoroughly for signs of:
   - Diseases (fungal, bacterial, viral)
   - Pests (insects, mites, nematodes)
   - Nutrient deficiencies (yellowing, stunting, discoloration patterns)
   - Weather/environmental stress (drought, waterlogging, heat stress)
3. Provide practical, actionable advice
4. ALWAYS consider the farmer's context (location, soil, weather)
5. Suggest affordable solutions first, then alternatives
6. Be encouraging - farming is challenging work

RESPONSE GUIDELINES:
- Be conversational and supportive
- If you see issues in images, describe what you observe clearly
- Provide step-by-step advice when recommending treatments
- Include cost estimates in local currency (₦ for Nigeria) when relevant
- Warn about safety precautions for any chemicals
- If unsure, recommend consulting local agricultural extension office
- Ask follow-up questions if you need more information

IMPORTANT: After your response, on a new line, provide a JSON summary:
|||METADATA|||
{"issueType": "disease|pest|nutrient|weather|general|none", "severity": "low|medium|high|critical|none", "suggestedTitle": "Brief 3-5 word title for this consultation"}`;

  // Build message history with image support
  const messages: any[] = [
    { role: 'system', content: systemPrompt }
  ];

  // Add chat history
  for (const msg of chatHistory) {
    if (msg.role === 'user' && msg.imageUrls && msg.imageUrls.length > 0) {
      const content: any[] = [{ type: 'text', text: msg.content }];
      msg.imageUrls.forEach(url => {
        content.push({ type: 'image_url', image_url: { url } });
      });
      messages.push({ role: 'user', content });
    } else {
      // Strip metadata from previous assistant messages
      let cleanContent = msg.content;
      if (msg.role === 'assistant' && cleanContent.includes('|||METADATA|||')) {
        cleanContent = cleanContent.split('|||METADATA|||')[0].trim();
      }
      // Preserve OpenRouter reasoning_details if present
      const baseMsg: any = { role: msg.role, content: cleanContent };
      if (msg.role === 'assistant' && (msg as any).reasoning_details) {
        baseMsg.reasoning_details = (msg as any).reasoning_details;
      }
      messages.push(baseMsg);
    }
  }

  // Add current user message with images
  if (imageUrls && imageUrls.length > 0) {
    const content: any[] = [{ type: 'text', text: userMessage }];
    imageUrls.forEach(url => {
      content.push({ type: 'image_url', image_url: { url } });
    });
    messages.push({ role: 'user', content });
  } else {
    messages.push({ role: 'user', content: userMessage });
  }

  // Use vision model if images present, otherwise chat model
  const hasImages = !!(imageUrls && imageUrls.length > 0);
  const modelToUse = hasImages ? VISION_MODEL : CHAT_MODEL;
  const max_tokens = hasImages ? VISION_MAX_TOKENS : CHAT_MAX_TOKENS;
  
  const result = await callWithFallback(
    (model) => api.chat.completions.create(withReasoning({ model, max_tokens, messages }) as any),
    modelToUse
  );

  const assistantMsg = result.choices[0].message as any;
  const fullResponse = assistantMsg?.content || '';
  const reasoning_details = assistantMsg?.reasoning_details;
  
  // Parse metadata from response
  let response = fullResponse;
  let issueType: string | undefined;
  let severity: string | undefined;
  let suggestedTitle: string | undefined;

  if (fullResponse.includes('|||METADATA|||')) {
    const parts = fullResponse.split('|||METADATA|||');
    response = parts[0].trim();
    try {
      const metadata = extractJSON(parts[1].trim());
      issueType = metadata.issueType !== 'none' ? metadata.issueType : undefined;
      severity = metadata.severity !== 'none' ? metadata.severity : undefined;
      suggestedTitle = metadata.suggestedTitle;
    } catch (e) {
      logger.warn('Failed to parse consultation metadata');
    }
  }

  return { response, issueType, severity, suggestedTitle, reasoning_details };
};
