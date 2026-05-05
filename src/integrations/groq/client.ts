import Constants from 'expo-constants';

import { env } from '@/shared/config/env';
import { redactSensitiveText } from '@/shared/utils/redaction';

export type GroqMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type GroqResponse = {
  choices: Array<{
    message: GroqMessage;
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  error?: { message: string; type?: string };
};

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Model fallback chain from the user's available models (screenshot)
// Ordered by capability then speed as fallback
const MODEL_FALLBACK_CHAIN = [
  'llama-3.3-70b-versatile',
  'qwen/qwen3-32b',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'llama-3.1-8b-instant',
  'gemma-2-9b-it',
  'groq/compound',
  'openai/gpt-oss-20b',
];

function getApiKey(): string | null {
  const key =
    env.groqApiKey ??
    Constants.expoConfig?.extra?.groqApiKey ??
    null;
  return key;
}

function canUseClientApiKey() {
  return env.allowClientAiKey || __DEV__;
}

export async function chatWithGroq(
  messages: GroqMessage[],
  options: { temperature?: number; maxTokens?: number; preferredModel?: string } = {}
): Promise<{ content: string; modelUsed: string; usage?: GroqResponse['usage'] }> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured. Add EXPO_PUBLIC_GROQ_API_KEY to your .env file.');
  }

  if (!canUseClientApiKey()) {
    throw new Error(
      'Direct client AI keys are disabled for this build. Route AI requests through a server-side function or set EXPO_PUBLIC_ALLOW_CLIENT_AI_KEY=true only for an explicitly accepted non-production build.'
    );
  }

  const modelsToTry = options.preferredModel
    ? [options.preferredModel, ...MODEL_FALLBACK_CHAIN.filter((m) => m !== options.preferredModel)]
    : MODEL_FALLBACK_CHAIN;

  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    try {
      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 1024,
        }),
      });

      const data = (await response.json()) as GroqResponse;

      if (!response.ok) {
        const status = response.status;
        const errorMessage = data.error?.message ?? `HTTP ${status}`;

        // 429 = rate limit / model overwhelmed
        if (status === 429 || status === 503 || errorMessage.toLowerCase().includes('rate limit')) {
          lastError = new Error(`Model ${model} overwhelmed: ${redactSensitiveText(errorMessage, 180)}`);
          continue; // try next model in chain
        }

        throw new Error(`Groq API error (${model}): ${redactSensitiveText(errorMessage, 180)}`);
      }

      const content = data.choices?.[0]?.message?.content?.trim() ?? '';
      return { content, modelUsed: model, usage: data.usage };
    } catch (error) {
      if (error instanceof Error && /fetch|network|timeout/i.test(error.message)) {
        lastError = new Error(`Network error with ${model}: ${redactSensitiveText(error.message, 180)}`);
        continue; // try next model
      }
      throw error;
    }
  }

  throw (
    lastError ?? new Error('All Groq models in the fallback chain are currently unavailable.')
  );
}
