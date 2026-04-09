import { 
  analyzeCropImage as analyzeCropImageAIcc, 
  chatWithDiagnosis as chatWithDiagnosisAIcc, 
  getModelName as getModelNameAIcc,
  getChatModelName as getChatModelNameAIcc,
  consultWithImages as consultWithImagesAIcc,
  chatWithImagesDetailed as chatWithImagesDetailedAIcc
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

// Model configuration
// Default to GPT-4o mini; override via env.
const VISION_MODEL = process.env.AI_VISION_MODEL || 'openai/gpt-4o-mini';
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

const AI_REASONING_ENABLED = (process.env.AI_REASONING_ENABLED || '').toLowerCase() === 'true';
const withReasoning = <T extends object>(payload: T): T => {
  if (!AI_REASONING_ENABLED) return payload;
  return { ...(payload as any), reasoning: { enabled: true } } as T;
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
export const chatWithImagesDetailed = chatWithImagesDetailedAIcc;

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
    (model) => api.chat.completions.create(
      withReasoning({
        model,
        max_tokens: VISION_MAX_TOKENS,
        messages: [
          {
            role: 'user',
            content: content,
          },
        ],
      }) as any
    ),
    VISION_MODEL
  );

  return result.choices[0].message.content || '';
};

/**
 * Chat with context - generic context-aware chat function
 */
export const chatWithContextDetailed = async (
  userMessage: string,
  chatHistory: { role: 'user' | 'assistant'; content: string; reasoning_details?: any }[],
  systemPrompt: string
): Promise<{ content: string; reasoning_details?: any }> => {
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

export const chatWithContext = async (
  userMessage: string,
  chatHistory: { role: 'user' | 'assistant'; content: string; reasoning_details?: any }[],
  systemPrompt: string
): Promise<string> => {
  const result = await chatWithContextDetailed(userMessage, chatHistory, systemPrompt);
  return result.content;
};
