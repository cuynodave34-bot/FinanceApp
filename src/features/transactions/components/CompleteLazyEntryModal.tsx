import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

import { listCategoriesByUser } from '@/db/repositories/categoriesRepository';
import {
  TransactionFeedItem,
  updateTransaction,
} from '@/db/repositories/transactionsRepository';
import { DatePickerField, TimePickerField } from '@/shared/ui/DateTimePickerField';
import { AppModal } from '@/shared/ui/Modal';
import { colors, radii, spacing } from '@/shared/theme/colors';
import { Category, CategoryType, PlanningType } from '@/shared/types/domain';
import {
  combineDateAndTime,
  isDateKey,
  isTimeKey,
  splitIsoToDateAndTime,
} from '@/shared/utils/time';

type CompleteLazyEntryModalProps = {
  visible: boolean;
  userId: string;
  transaction: TransactionFeedItem | null;
  onClose: () => void;
  onCompleted: () => void;
};

const expensePlanningOptions: { value: PlanningType; label: string }[] = [
  { value: 'planned', label: 'Planned' },
  { value: 'unplanned', label: 'Unplanned' },
  { value: 'impulse', label: 'Impulse' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'unknown', label: 'Unknown' },
];

export function CompleteLazyEntryModal({
  visible,
  userId,
  transaction,
  onClose,
  onCompleted,
}: CompleteLazyEntryModalProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [notes, setNotes] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [locationName, setLocationName] = useState('');
  const [isImpulse, setIsImpulse] = useState(false);
  const [planningType, setPlanningType] = useState<PlanningType>('unknown');
  const [transactionDate, setTransactionDate] = useState('');
  const [transactionTime, setTransactionTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !transaction) return;

    try {
      const parts = splitIsoToDateAndTime(transaction.transactionAt);
      setTransactionDate(parts.date);
      setTransactionTime(parts.time);
    } catch {
      setTransactionDate('');
      setTransactionTime('');
    }

    setCategoryId(transaction.categoryId ?? '');
    setNotes(transaction.notes ?? '');
    setPhotoUrl(transaction.photoUrl ?? '');
    setLocationName(transaction.locationName ?? '');
    setIsImpulse(
      transaction.type === 'expense'
        ? transaction.isImpulse || transaction.planningType === 'impulse'
        : false
    );
    setPlanningType(
      transaction.type === 'expense'
        ? transaction.isImpulse
          ? 'impulse'
          : transaction.planningType ?? 'unknown'
        : 'unknown'
    );
    setStatus(null);
  }, [transaction, visible]);

  useEffect(() => {
    if (!visible || !userId) return;
    listCategoriesByUser(userId)
      .then(setCategories)
      .catch((error) =>
        setStatus(error instanceof Error ? error.message : 'Failed to load categories.')
      );
  }, [userId, visible]);

  const availableCategories = useMemo(
    () =>
      categories.filter((category) => {
        if (!transaction || transaction.type === 'transfer') return false;
        return category.type === 'both' || category.type === transaction.type;
      }),
    [categories, transaction]
  );

  async function handleComplete() {
    if (!transaction || saving) return;

    if (!isDateKey(transactionDate)) {
      setStatus('Select a valid date.');
      return;
    }
    if (!isTimeKey(transactionTime)) {
      setStatus('Select a valid time.');
      return;
    }

    try {
      setSaving(true);
      await updateTransaction({
        id: transaction.id,
        userId,
        type: transaction.type,
        amount: transaction.amount,
        accountId: transaction.accountId ?? null,
        toAccountId: transaction.toAccountId ?? null,
        savingsGoalId: transaction.savingsGoalId ?? null,
        fromSavingsGoalId: transaction.fromSavingsGoalId ?? null,
        categoryId: categoryId || null,
        notes,
        photoUrl: photoUrl || null,
        locationName: locationName || null,
        isImpulse: transaction.type === 'expense' ? isImpulse : false,
        planningType: transaction.type === 'expense' ? planningType : 'unknown',
        isLazyEntry: false,
        isIncomplete: false,
        needsReview: false,
        reviewReason: null,
        transactionAt: combineDateAndTime(transactionDate, transactionTime),
      });
      onCompleted();
      onClose();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to complete entry.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppModal
      visible={visible}
      title="Complete Entry"
      message="Add the missing details to finalize this transaction."
      onRequestClose={onClose}
      buttons={[
        { text: 'Cancel', style: 'cancel', onPress: onClose },
        { text: saving ? 'Saving...' : 'Save', onPress: handleComplete },
      ]}
    >
      <ScrollView style={styles.form} contentContainerStyle={styles.formContent}>
        {status ? <Text style={styles.status}>{status}</Text> : null}
        <Text style={styles.label}>Date and time</Text>
        <View style={styles.inputRow}>
          <DatePickerField
            value={transactionDate}
            onChange={setTransactionDate}
            placeholder="Date"
            style={styles.rowInput}
          />
          <TimePickerField
            value={transactionTime}
            onChange={setTransactionTime}
            placeholder="Time"
            style={styles.rowInput}
          />
        </View>

        <Text style={styles.label}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Pressable
            onPress={() => setCategoryId('')}
            style={[styles.chip, !categoryId && styles.chipActive]}
          >
            <Text style={[styles.chipLabel, !categoryId && styles.chipLabelActive]}>
              Uncategorised
            </Text>
          </Pressable>
          {availableCategories.map((category) => (
            <Pressable
              key={category.id}
              onPress={() => setCategoryId(category.id)}
              style={[styles.chip, categoryId === category.id && styles.chipActive]}
            >
              <Text style={[styles.chipLabel, categoryId === category.id && styles.chipLabelActive]}>
                {category.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {transaction?.type === 'expense' ? (
          <>
            <Text style={styles.label}>Planning type</Text>
            <View style={styles.chipRow}>
              {expensePlanningOptions.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => {
                    setPlanningType(option.value);
                    setIsImpulse(option.value === 'impulse');
                  }}
                  style={[styles.chip, planningType === option.value && styles.chipActive]}
                >
                  <Text style={[styles.chipLabel, planningType === option.value && styles.chipLabelActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Notes (optional)"
          placeholderTextColor={colors.mutedInk}
          multiline
          style={[styles.input, styles.notesInput]}
        />

        <TextInput
          value={locationName}
          onChangeText={setLocationName}
          placeholder="Location (optional)"
          placeholderTextColor={colors.mutedInk}
          style={styles.input}
        />

        {photoUrl ? (
          <View style={styles.photoPreviewBox}>
            <Image source={{ uri: photoUrl }} style={styles.photoPreview} />
            <Pressable onPress={() => setPhotoUrl('')} style={styles.photoRemoveButton}>
              <Ionicons name="close-circle" size={22} color={colors.ink} />
            </Pressable>
          </View>
        ) : null}
        <View style={styles.photoActionsRow}>
          <Pressable
            onPress={async () => {
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [4, 3],
                quality: 0.8,
              });
              if (!result.canceled && result.assets.length > 0) {
                setPhotoUrl(result.assets[0].uri);
              }
            }}
            style={styles.photoButton}
          >
            <Ionicons name="images-outline" size={18} color={colors.primary} />
            <Text style={styles.photoButtonLabel}>Gallery</Text>
          </Pressable>
          <Pressable
            onPress={async () => {
              const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [4, 3],
                quality: 0.8,
              });
              if (!result.canceled && result.assets.length > 0) {
                setPhotoUrl(result.assets[0].uri);
              }
            }}
            style={styles.photoButton}
          >
            <Ionicons name="camera-outline" size={18} color={colors.primary} />
            <Text style={styles.photoButtonLabel}>Camera</Text>
          </Pressable>
        </View>
      </ScrollView>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  form: { maxHeight: 460 },
  formContent: { gap: spacing.md },
  status: { color: colors.warning, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  label: { color: colors.mutedInk, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  inputRow: { flexDirection: 'row', gap: 10 },
  rowInput: { flex: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: radii.full, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surfaceSecondary },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipLabel: { color: colors.ink, fontWeight: '600', fontSize: 12 },
  chipLabelActive: { color: colors.surface },
  flagRow: { borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.surfaceSecondary },
  flagRowActive: { backgroundColor: colors.warningLight, borderColor: colors.warning },
  flagText: { color: colors.ink, fontWeight: '600' },
  flagTextActive: { color: colors.warning },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: 12, backgroundColor: colors.surfaceSecondary, color: colors.ink },
  notesInput: { minHeight: 80, textAlignVertical: 'top' },
  photoPreviewBox: { position: 'relative', alignSelf: 'flex-start' },
  photoPreview: { width: 180, height: 135, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  photoRemoveButton: { position: 'absolute', top: -8, right: -8, backgroundColor: colors.surface, borderRadius: 12, zIndex: 1 },
  photoActionsRow: { flexDirection: 'row', gap: spacing.md },
  photoButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: 10, backgroundColor: colors.surfaceSecondary, flex: 1, justifyContent: 'center' },
  photoButtonLabel: { color: colors.primary, fontWeight: '700', fontSize: 13 },
});
