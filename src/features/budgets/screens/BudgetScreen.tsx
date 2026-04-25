import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  deleteBudget,
  listBudgetsByUser,
  upsertBudget,
} from '@/db/repositories/budgetsRepository';
import { listTransactionsByUser } from '@/db/repositories/transactionsRepository';
import { useAuth } from '@/features/auth/provider/AuthProvider';
import { useAppPreferences } from '@/features/preferences/provider/AppPreferencesProvider';
import {
  BudgetSummary,
  calculateBudgetSummaries,
  getBudgetSummaryForDate,
  getBudgetTimeline,
} from '@/services/budgets/calculateBudgetSummaries';
import { colors } from '@/shared/theme/colors';
import { formatDateKey, formatMoney, maskFinancialValue } from '@/shared/utils/format';
import { isDateKey, toDateKey } from '@/shared/utils/time';
import { SectionCard } from '@/shared/ui/SectionCard';

const todayDateKey = () => toDateKey(new Date());

export function BudgetScreen() {
  const { user } = useAuth();
  const { balancesHidden, preferencesLoading, toggleBalancesHidden } = useAppPreferences();
  const [summaries, setSummaries] = useState<BudgetSummary[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    budgetDate: todayDateKey(),
    budgetAmount: '',
    notes: '',
  });

  const refresh = useCallback(async () => {
    if (!user) {
      return;
    }

    const [budgets, transactions] = await Promise.all([
      listBudgetsByUser(user.id),
      listTransactionsByUser(user.id),
    ]);

    setSummaries(
      calculateBudgetSummaries({
        budgets,
        transactions,
        today: todayDateKey(),
      })
    );
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((error) => {
        setStatus(error instanceof Error ? error.message : 'Failed to load budgets.');
      });
    }, [refresh])
  );

  const todaySummary = getBudgetSummaryForDate(summaries, todayDateKey());
  const timeline = useMemo(
    () => getBudgetTimeline(summaries, todayDateKey(), 10),
    [summaries]
  );

  async function handleSaveBudget() {
    if (!user || saving) {
      return;
    }

    if (!isDateKey(draft.budgetDate)) {
      setStatus('Budget date must use YYYY-MM-DD format.');
      return;
    }

    try {
      setSaving(true);
      await upsertBudget({
        userId: user.id,
        budgetDate: draft.budgetDate,
        budgetAmount: Number(draft.budgetAmount || '0'),
        notes: draft.notes,
      });
      setStatus(`Budget saved for ${draft.budgetDate}.`);
      setDraft({
        budgetDate: draft.budgetDate,
        budgetAmount: '',
        notes: '',
      });
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save budget.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteBudget(summary: BudgetSummary) {
    if (!user || !summary.budgetId) {
      return;
    }

    try {
      await deleteBudget(summary.budgetId, user.id);
      setStatus(`Budget removed for ${summary.date}.`);
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to delete budget.');
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <Text style={styles.kicker}>Budget</Text>
        <Text style={styles.title}>Plan what is safe to spend.</Text>
        <Text style={styles.subtitle}>
          Daily budgets are now date-based records with deterministic carry-over
          and overspend reduction.
        </Text>
        <Pressable onPress={() => toggleBalancesHidden()} style={styles.visibilityToggle}>
          <Text style={styles.visibilityToggleLabel}>
            {preferencesLoading
              ? 'Loading privacy setting...'
              : balancesHidden
                ? 'Show amounts'
                : 'Hide amounts'}
          </Text>
        </Pressable>
        {status ? <Text style={styles.status}>{status}</Text> : null}
      </View>

      <SectionCard
        title="Today"
        subtitle="This is the live result after carry-over, overspend reduction, and recorded expenses."
      >
        {todaySummary ? (
          <>
            <BudgetMetricRow
              label="Base budget"
              value={todaySummary.baseBudget}
              hidden={balancesHidden}
            />
            <BudgetMetricRow
              label="Carry-over"
              value={todaySummary.carriedOverAmount}
              hidden={balancesHidden}
            />
            <BudgetMetricRow
              label="Overspend reduction"
              value={todaySummary.overspentAmount}
              hidden={balancesHidden}
            />
            <BudgetMetricRow
              label="Available today"
              value={todaySummary.availableToSpend}
              hidden={balancesHidden}
            />
            <BudgetMetricRow
              label="Spent today"
              value={todaySummary.spentAmount}
              hidden={balancesHidden}
            />
            <BudgetMetricRow
              label="Remaining today"
              value={todaySummary.remainingAmount}
              emphasize
              hidden={balancesHidden}
            />
          </>
        ) : (
          <Text style={styles.emptyText}>No budget summary available yet.</Text>
        )}
      </SectionCard>

      <SectionCard
        title="Set Budget"
        subtitle="Use YYYY-MM-DD so future budgets can be staged explicitly."
      >
        <TextInput
          value={draft.budgetDate}
          onChangeText={(value) => setDraft((current) => ({ ...current, budgetDate: value }))}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.mutedInk}
          autoCapitalize="none"
          style={styles.input}
        />
        <TextInput
          value={draft.budgetAmount}
          onChangeText={(value) => setDraft((current) => ({ ...current, budgetAmount: value }))}
          placeholder="Budget amount"
          placeholderTextColor={colors.mutedInk}
          keyboardType="decimal-pad"
          style={styles.input}
        />
        <TextInput
          value={draft.notes}
          onChangeText={(value) => setDraft((current) => ({ ...current, notes: value }))}
          placeholder="Notes"
          placeholderTextColor={colors.mutedInk}
          multiline
          style={[styles.input, styles.notesInput]}
        />
        <Pressable
          onPress={handleSaveBudget}
          disabled={saving}
          style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
        >
          <Text style={styles.primaryButtonLabel}>
            {saving ? 'Saving...' : 'Save Budget'}
          </Text>
        </Pressable>
      </SectionCard>

      <SectionCard
        title="Budget Timeline"
        subtitle="Upcoming days show how unused budget carries forward and overspending reduces later budgets."
      >
        {timeline.length === 0 ? (
          <Text style={styles.emptyText}>No budget timeline yet.</Text>
        ) : (
          timeline.map((summary) => (
            <View key={summary.date} style={styles.timelineCard}>
              <View style={styles.timelineHeader}>
                <View style={styles.timelineCopy}>
                  <Text style={styles.timelineTitle}>{formatDateKey(summary.date)}</Text>
                  <Text style={styles.timelineMeta}>
                    Base {maskFinancialValue(formatMoney(summary.baseBudget), balancesHidden)} |
                    Available{' '}
                    {maskFinancialValue(
                      formatMoney(summary.availableToSpend),
                      balancesHidden
                    )}
                  </Text>
                </View>
                {summary.budgetId ? (
                  <Pressable onPress={() => handleDeleteBudget(summary)}>
                    <Text style={styles.inlineAction}>Delete</Text>
                  </Pressable>
                ) : null}
              </View>
              <View style={styles.metricGrid}>
                <MiniMetric
                  label="Carry"
                  value={summary.carriedOverAmount}
                  hidden={balancesHidden}
                />
                <MiniMetric
                  label="Overspend"
                  value={summary.overspentAmount}
                  hidden={balancesHidden}
                />
                <MiniMetric label="Spent" value={summary.spentAmount} hidden={balancesHidden} />
                <MiniMetric
                  label="Remaining"
                  value={summary.remainingAmount}
                  hidden={balancesHidden}
                />
              </View>
              {summary.notes ? <Text style={styles.noteText}>{summary.notes}</Text> : null}
            </View>
          ))
        )}
      </SectionCard>
    </ScrollView>
  );
}

function BudgetMetricRow({
  label,
  value,
  emphasize,
  hidden,
}: {
  label: string;
  value: number;
  emphasize?: boolean;
  hidden?: boolean;
}) {
  return (
    <View style={styles.metricRow}>
      <Text style={[styles.metricLabel, emphasize && styles.metricLabelStrong]}>{label}</Text>
      <Text style={[styles.metricValue, emphasize && styles.metricValueStrong]}>
        {maskFinancialValue(formatMoney(value), Boolean(hidden))}
      </Text>
    </View>
  );
}

function MiniMetric({
  label,
  value,
  hidden,
}: {
  label: string;
  value: number;
  hidden?: boolean;
}) {
  return (
    <View style={styles.miniMetric}>
      <Text style={styles.miniMetricLabel}>{label}</Text>
      <Text style={styles.miniMetricValue}>
        {maskFinancialValue(formatMoney(value), Boolean(hidden))}
      </Text>
    </View>
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
  kicker: {
    fontSize: 12,
    color: colors.mutedInk,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '700',
  },
  title: {
    fontSize: 30,
    lineHeight: 34,
    color: colors.ink,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.mutedInk,
  },
  status: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  visibilityToggle: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.canvas,
  },
  visibilityToggleLabel: {
    color: colors.ink,
    fontWeight: '700',
    fontSize: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.canvas,
    color: colors.ink,
  },
  notesInput: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  primaryButton: {
    backgroundColor: colors.ink,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonLabel: {
    color: colors.surface,
    fontWeight: '800',
    fontSize: 14,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  metricLabel: {
    color: colors.ink,
    fontSize: 14,
  },
  metricLabelStrong: {
    fontWeight: '800',
  },
  metricValue: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  metricValueStrong: {
    fontWeight: '800',
  },
  timelineCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.canvas,
    padding: 16,
    gap: 12,
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  timelineCopy: {
    flex: 1,
    gap: 4,
  },
  timelineTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  timelineMeta: {
    color: colors.mutedInk,
    fontSize: 12,
    lineHeight: 18,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  miniMetric: {
    minWidth: '47%',
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 4,
  },
  miniMetricLabel: {
    color: colors.mutedInk,
    fontSize: 12,
    fontWeight: '700',
  },
  miniMetricValue: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  noteText: {
    color: colors.mutedInk,
    fontSize: 13,
    lineHeight: 18,
  },
  inlineAction: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  emptyText: {
    color: colors.mutedInk,
    fontSize: 14,
    lineHeight: 20,
  },
});
