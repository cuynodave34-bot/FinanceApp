import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAuth } from '@/features/auth/provider/AuthProvider';
import { useAppPreferences } from '@/features/preferences/provider/AppPreferencesProvider';
import { listTransactionsByUser, TransactionFeedItem } from '@/db/repositories/transactionsRepository';
import { colors, spacing, radii, shadows } from '@/shared/theme/colors';
import { formatMoney, maskFinancialValue } from '@/shared/utils/format';
import { toDateKey } from '@/shared/utils/time';

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function startOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

export function CalendarScreen() {
  const { user } = useAuth();
  const { balancesHidden } = useAppPreferences();
  const [transactions, setTransactions] = useState<TransactionFeedItem[]>([]);
  const [now, setNow] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(toDateKey(new Date()));

  const refresh = useCallback(async () => {
    if (!user) return;
    const rows = await listTransactionsByUser(user.id);
    setTransactions(rows);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch(() => {});
    }, [refresh])
  );

  const year = now.getFullYear();
  const month = now.getMonth();
  const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' });
  const totalDays = daysInMonth(year, month);
  const startDay = startOfMonth(year, month);

  const txByDate = useMemo(() => {
    const map = new Map<string, TransactionFeedItem[]>();
    for (const tx of transactions) {
      const date = tx.transactionAt.slice(0, 10);
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(tx);
    }
    return map;
  }, [transactions]);

  const selectedTxs = txByDate.get(selectedDate) ?? [];

  function prevMonth() {
    setNow(new Date(year, month - 1, 1));
  }

  function nextMonth() {
    setNow(new Date(year, month + 1, 1));
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={prevMonth} style={styles.arrow}>
          <Text style={styles.arrowLabel}>&lt;</Text>
        </Pressable>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <Pressable onPress={nextMonth} style={styles.arrow}>
          <Text style={styles.arrowLabel}>&gt;</Text>
        </Pressable>
      </View>

      <View style={styles.calendarGrid}>
        {dayNames.map((d) => (
          <View key={d} style={styles.dayHeader}>
            <Text style={styles.dayHeaderLabel}>{d}</Text>
          </View>
        ))}
        {Array.from({ length: startDay }).map((_, i) => (
          <View key={`pad-${i}`} style={styles.dayCell} />
        ))}
        {Array.from({ length: totalDays }).map((_, i) => {
          const day = i + 1;
          const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const hasTx = txByDate.has(dateKey);
          const isSelected = selectedDate === dateKey;
          return (
            <Pressable
              key={dateKey}
              onPress={() => setSelectedDate(dateKey)}
              style={[styles.dayCell, isSelected && styles.dayCellActive]}
            >
              <Text style={[styles.dayCellLabel, isSelected && styles.dayCellLabelActive]}>{day}</Text>
              {hasTx ? <View style={styles.dot} /> : null}
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.card, shadows.small]}>
        <Text style={styles.cardTitle}>Transactions on {selectedDate}</Text>
        {selectedTxs.length === 0 ? (
          <Text style={styles.emptyText}>No transactions on this day.</Text>
        ) : (
          selectedTxs.map((tx) => (
            <View key={tx.id} style={styles.listRow}>
              <View style={styles.listCopy}>
                <Text style={styles.listLabel}>
                  {tx.notes?.trim() || (tx.type === 'transfer' ? 'Transfer' : tx.type)}
                </Text>
                <Text style={styles.listMeta}>
                  {tx.accountName ?? 'Unknown'}
                  {tx.type === 'transfer' ? ` -> ${tx.toAccountName ?? 'Unknown'}` : ` | ${tx.categoryName ?? 'Uncategorised'}`}
                </Text>
              </View>
              <Text style={[styles.listValue, tx.type === 'income' ? styles.income : tx.type === 'expense' ? styles.expense : null]}>
                {maskFinancialValue(
                  tx.type === 'income'
                    ? `+${formatMoney(tx.amount)}`
                    : tx.type === 'expense'
                    ? `-${formatMoney(tx.amount)}`
                    : formatMoney(tx.amount),
                  balancesHidden
                )}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 120, gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthLabel: { fontSize: 20, fontWeight: '800', color: colors.ink },
  arrow: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border },
  arrowLabel: { fontSize: 18, fontWeight: '700', color: colors.ink },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: 10 },
  dayHeader: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 8 },
  dayHeaderLabel: { fontSize: 12, fontWeight: '700', color: colors.mutedInk },
  dayCell: { width: `${100 / 7}%`, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: radii.md, gap: 2 },
  dayCellActive: { backgroundColor: colors.primary },
  dayCellLabel: { fontSize: 14, fontWeight: '600', color: colors.ink },
  dayCellLabelActive: { color: colors.surface },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.primary },
  card: { backgroundColor: colors.surface, borderRadius: radii.xxl, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  listRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 12 },
  listCopy: { flex: 1, gap: 3 },
  listLabel: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  listMeta: { color: colors.mutedInk, fontSize: 12 },
  listValue: { fontSize: 14, fontWeight: '700', textAlign: 'right', color: colors.ink },
  income: { color: colors.success },
  expense: { color: colors.danger },
  emptyText: { color: colors.mutedInk, fontSize: 14 },
});
