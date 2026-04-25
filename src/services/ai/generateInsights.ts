import { chatWithGroq, GroqMessage } from '@/integrations/groq/client';
import { buildRagContext } from './buildRagContext';

export type InsightType = 'overview' | 'budget_advice' | 'spending_analysis' | 'savings_tips' | 'debt_strategy' | 'habit_coaching';

const INSIGHT_PROMPTS: Record<InsightType, string> = {
  overview:
    'Give a brief, friendly financial health overview. Mention total balance, spending trends, and one actionable tip. Keep it under 150 words.',
  budget_advice:
    'Analyze the daily budget situation and give 2-3 specific tips to stay within budget or improve daily financial discipline. Keep it under 150 words.',
  spending_analysis:
    'Analyze recent spending patterns. Point out any concerning trends (e.g., frequent impulse purchases, overspending categories) and suggest improvements. Keep it under 150 words.',
  savings_tips:
    'Review savings goals and current progress. Give 2-3 realistic tips to boost savings without causing lifestyle strain. Keep it under 150 words.',
  debt_strategy:
    'Review any outstanding debts and give a prioritized payoff strategy or tips to avoid new debt. Keep it under 150 words.',
  habit_coaching:
    'Act as a friendly financial coach. Give encouragement based on streaks or consistency, plus one small habit to build. Keep it under 150 words.',
};

export async function generateInsight(userId: string, type: InsightType) {
  const context = await buildRagContext(userId);

  const systemPrompt = `You are Penny, a friendly and concise financial assistant for a student using the Student Finance Tracker app. You have access to the user's real financial data. Be supportive, non-judgmental, and practical. Always base your advice on the data provided. Never make up numbers.`;

  const userPrompt = `Here is the user's current financial snapshot (today is ${context.today}):

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
${context.reports}

--- TASK ---
${INSIGHT_PROMPTS[type]}`;

  const messages: GroqMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const result = await chatWithGroq(messages, { temperature: 0.6, maxTokens: 512 });
  return result;
}
