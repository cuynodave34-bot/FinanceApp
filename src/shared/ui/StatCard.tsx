import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/shared/theme/colors';

type StatCardProps = {
  label: string;
  value: string;
  accent: 'mint' | 'sun' | 'sand' | 'ink';
};

const accentMap = {
  mint: colors.mint,
  sun: colors.sun,
  sand: colors.sand,
  ink: colors.accountCard.ink,
};

export function StatCard({ label, value, accent }: StatCardProps) {
  return (
    <View style={[styles.card, { backgroundColor: accentMap[accent] }]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '47%',
    minHeight: 104,
    borderRadius: 22,
    padding: 16,
    justifyContent: 'space-between',
  },
  label: {
    color: colors.mutedInk,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  value: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '800',
  },
});
