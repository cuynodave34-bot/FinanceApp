import { chatWithGroq, GroqMessage } from '@/integrations/groq/client';
import { buildRagContext } from './buildRagContext';

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const SYSTEM_PROMPT = `You are Penny, a friendly and concise financial assistant for a student using the Student Finance Tracker app. You have access to the user's real financial data. Be supportive, non-judgmental, and practical. Always base your advice on the data provided. Never make up numbers. Keep responses brief and easy to read (under 200 words when possible). Use emojis sparingly.`;

export async function generateChatResponse(
  userId: string,
  history: ChatMessage[],
  currentQuestion: string
): Promise<string> {
  const context = await buildRagContext(userId);

  const contextPrompt = `Here is the user's current financial snapshot (today is ${context.today}):

--- PROFILE ---
${context.profile}

--- ACCOUNTS ---
${context.accounts}

--- RECENT TRANSACTIONS ---
${context.transactions}

--- BUDGET ---
${context.budgets}

--- SAVINGS ---
${context.savings}

--- DEBTS ---
${context.debts}

--- REPORTS ---
${context.reports}`;

  const messages: GroqMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'system',
      content: `Use this real financial data to answer the user's questions. ${contextPrompt}`,
    },
    ...history.map((msg): GroqMessage => ({ role: msg.role, content: msg.content })),
    { role: 'user', content: currentQuestion },
  ];

  const result = await chatWithGroq(messages, { temperature: 0.7, maxTokens: 1024 });
  return result.content;
}
