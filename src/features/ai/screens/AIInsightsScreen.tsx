import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAuth } from '@/features/auth/provider/AuthProvider';
import { colors } from '@/shared/theme/colors';
import { SectionCard } from '@/shared/ui/SectionCard';
import { generateInsight, InsightType } from '@/services/ai/generateInsights';

const INSIGHT_CARDS: { type: InsightType; title: string; emoji: string }[] = [
  { type: 'overview', title: 'Financial Overview', emoji: '📊' },
  { type: 'budget_advice', title: 'Budget Tips', emoji: '🎯' },
  { type: 'spending_analysis', title: 'Spending Analysis', emoji: '🧾' },
  { type: 'savings_tips', title: 'Savings Coach', emoji: '💰' },
  { type: 'debt_strategy', title: 'Debt Strategy', emoji: '📉' },
  { type: 'habit_coaching', title: 'Habit Coach', emoji: '🔥' },
];

export function AIInsightsScreen() {
  const { user } = useAuth();
  const [results, setResults] = useState<Record<InsightType, string | null>>({
    overview: null,
    budget_advice: null,
    spending_analysis: null,
    savings_tips: null,
    debt_strategy: null,
    habit_coaching: null,
  });
  const [loading, setLoading] = useState<Record<InsightType, boolean>>({
    overview: false,
    budget_advice: false,
    spending_analysis: false,
    savings_tips: false,
    debt_strategy: false,
    habit_coaching: false,
  });
  const [errors, setErrors] = useState<Record<InsightType, string | null>>({
    overview: null,
    budget_advice: null,
    spending_analysis: null,
    savings_tips: null,
    debt_strategy: null,
    habit_coaching: null,
  });
  const [expanded, setExpanded] = useState<InsightType | null>(null);

  useFocusEffect(
    useCallback(() => {
      // clear transient errors on revisit
      setErrors({
        overview: null,
        budget_advice: null,
        spending_analysis: null,
        savings_tips: null,
        debt_strategy: null,
        habit_coaching: null,
      });
    }, [])
  );

  async function handleGenerate(type: InsightType) {
    if (!user) {
      setErrors((prev) => ({ ...prev, [type]: 'You must be signed in to use AI insights.' }));
      return;
    }

    setLoading((prev) => ({ ...prev, [type]: true }));
    setErrors((prev) => ({ ...prev, [type]: null }));

    try {
      const result = await generateInsight(user.id, type);
      setResults((prev) => ({ ...prev, [type]: result.content }));
      setExpanded(type);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate insight.';
      setErrors((prev) => ({ ...prev, [type]: message }));
    } finally {
      setLoading((prev) => ({ ...prev, [type]: false }));
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.title}>AI Insights</Text>
        <Text style={styles.subtitle}>
          Ask Penny, your financial coach, for personalized advice based on your real data.
          Insights are generated on-device using Groq AI with smart model fallback.
        </Text>
      </View>

      {INSIGHT_CARDS.map((card) => {
        const isLoading = loading[card.type];
        const result = results[card.type];
        const error = errors[card.type];
        const isExpanded = expanded === card.type;

        return (
          <SectionCard key={card.type} title={`${card.emoji} ${card.title}`} subtitle="">
            {!result && !error ? (
              <Pressable
                onPress={() => handleGenerate(card.type)}
                disabled={isLoading}
                style={[styles.generateButton, isLoading && styles.generateButtonDisabled]}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.ink} size="small" />
                ) : (
                  <Text style={styles.generateLabel}>Generate Insight</Text>
                )}
              </Pressable>
            ) : null}

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
                <Pressable onPress={() => handleGenerate(card.type)} style={styles.retryButton}>
                  <Text style={styles.retryLabel}>Retry</Text>
                </Pressable>
              </View>
            ) : null}

            {result ? (
              <View>
                <Text style={styles.insightText}>{result}</Text>
                <Pressable
                  onPress={() => setExpanded(isExpanded ? null : card.type)}
                  style={styles.toggleButton}
                >
                  <Text style={styles.toggleLabel}>{isExpanded ? 'Collapse' : 'Expand'}</Text>
                </Pressable>
              </View>
            ) : null}
          </SectionCard>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 24,
    paddingBottom: 120,
    gap: 16,
  },
  hero: {
    backgroundColor: colors.surface,
    borderRadius: 28,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.ink,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.mutedInk,
  },
  generateButton: {
    backgroundColor: colors.ink,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignSelf: 'flex-start',
  },
  generateButtonDisabled: {
    opacity: 0.6,
  },
  generateLabel: {
    color: colors.surface,
    fontWeight: '700',
    fontSize: 13,
  },
  errorBox: {
    backgroundColor: '#fff0f0',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#ffcdd2',
    gap: 10,
  },
  errorText: {
    color: '#c62828',
    fontSize: 14,
    fontWeight: '600',
  },
  retryButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  retryLabel: {
    color: colors.ink,
    fontWeight: '700',
    fontSize: 13,
  },
  insightText: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.ink,
  },
  toggleButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.mutedInk,
    textDecorationLine: 'underline',
  },
});
