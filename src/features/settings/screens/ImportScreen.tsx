import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/features/auth/provider/AuthProvider';
import { importTransactionsFromCsv } from '@/services/import/csvImport';
import { colors, spacing, radii, shadows } from '@/shared/theme/colors';

export function ImportScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [csvImportText, setCsvImportText] = useState('');
  const [importing, setImporting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setStatus(null);
    }, [])
  );

  async function handleImportCsv() {
    if (!user || !csvImportText.trim()) return;
    try {
      setImporting(true);
      const result = await importTransactionsFromCsv(user.id, csvImportText.trim());
      const parts = [
        result.imported > 0 ? `${result.imported} imported` : '',
        result.skipped > 0 ? `${result.skipped} skipped` : '',
        result.errors.length > 0 ? `${result.errors.length} errors` : '',
      ].filter(Boolean);
      setStatus(`Import complete: ${parts.join(', ')}.`);
      if (result.errors.length > 0) {
        console.warn('CSV import errors', result.errors);
      }
      setCsvImportText('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.pageTitle}>Import Transactions</Text>
        <View style={{ width: 40 }} />
      </View>
      {status ? <Text style={styles.status}>{status}</Text> : null}

      <View style={[styles.card, shadows.small]}>
        <Text style={styles.cardTitle}>Import from CSV</Text>
        <Text style={styles.emptyText}>
          Paste CSV rows below. Expected columns: date, amount, type, account, category (optional), notes (optional).
        </Text>
        <TextInput
          value={csvImportText}
          onChangeText={setCsvImportText}
          placeholder="Paste CSV rows here..."
          placeholderTextColor={colors.mutedInk}
          multiline
          numberOfLines={4}
          style={[styles.input, { minHeight: 96, textAlignVertical: 'top' }]}
        />
        <Pressable
          onPress={handleImportCsv}
          disabled={importing || !csvImportText.trim()}
          style={[styles.primaryButton, (importing || !csvImportText.trim()) && styles.primaryButtonDisabled]}
        >
          <Text style={styles.primaryButtonLabel}>{importing ? 'Importing...' : 'Import CSV'}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 120, gap: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { fontSize: 22, fontWeight: '800', color: colors.ink, flex: 1 },
  status: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  card: { backgroundColor: colors.surface, borderRadius: radii.xxl, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: 12, backgroundColor: colors.surfaceSecondary, color: colors.ink },
  primaryButton: { backgroundColor: colors.primary, borderRadius: radii.lg, paddingVertical: 14, alignItems: 'center' },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonLabel: { color: colors.surface, fontWeight: '800', fontSize: 14 },
  emptyText: { color: colors.mutedInk, fontSize: 14, lineHeight: 20 },
});
