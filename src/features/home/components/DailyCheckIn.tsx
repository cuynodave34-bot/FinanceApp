import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/shared/theme/colors';
import { toDateKey } from '@/shared/utils/time';

function buildCheckinKey(dateKey: string) {
  return `student-finance:daily-checkin:${dateKey}`;
}

export function DailyCheckIn() {
  const router = useRouter();
  const [checkedIn, setCheckedIn] = useState(false);
  const todayKey = toDateKey(new Date());

  const loadState = useCallback(async () => {
    const value = await AsyncStorage.getItem(buildCheckinKey(todayKey));
    setCheckedIn(value === 'done');
  }, [todayKey]);

  useEffect(() => {
    loadState();
  }, [loadState]);

  const markDone = useCallback(async () => {
    await AsyncStorage.setItem(buildCheckinKey(todayKey), 'done');
    setCheckedIn(true);
  }, [todayKey]);

  if (checkedIn) {
    return null;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Daily check-in</Text>
      <Text style={styles.question}>Did you spend anything today?</Text>
      <View style={styles.row}>
        <Pressable
          onPress={() => {
            markDone();
            router.push('/transactions');
          }}
          style={[styles.chip, styles.primaryChip]}
        >
          <Text style={styles.primaryLabel}>Yes, add expense</Text>
        </Pressable>
        <Pressable
          onPress={markDone}
          style={[styles.chip, styles.secondaryChip]}
        >
          <Text style={styles.secondaryLabel}>No spending</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            markDone();
            router.push('/transactions');
          }}
          style={[styles.chip, styles.secondaryChip]}
        >
          <Text style={styles.secondaryLabel}>Add income</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.mutedInk,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  question: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryChip: {
    backgroundColor: colors.ink,
  },
  primaryLabel: {
    color: colors.surface,
    fontWeight: '700',
    fontSize: 13,
  },
  secondaryChip: {
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryLabel: {
    color: colors.ink,
    fontWeight: '700',
    fontSize: 13,
  },
});
