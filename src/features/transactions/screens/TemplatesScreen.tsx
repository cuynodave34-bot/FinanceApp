import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { listAccountsByUser } from '@/db/repositories/accountsRepository';
import { listCategoriesByUser } from '@/db/repositories/categoriesRepository';
import { listSavingsByUser } from '@/db/repositories/savingsGoalsRepository';
import {
  archiveTransactionTemplate,
  checkTransactionTemplateConflict,
  createTransactionTemplate,
  listTransactionTemplatesByUser,
  TemplateMutationInput,
  updateTransactionTemplate,
} from '@/db/repositories/transactionTemplatesRepository';
import { useAuth } from '@/features/auth/provider/AuthProvider';
import { colors, radii, shadows, spacing } from '@/shared/theme/colors';
import {
  Account,
  Category,
  Savings,
  TransactionTemplate,
  TransactionType,
} from '@/shared/types/domain';
import { formatAccountLabel, formatTransactionAccountLabel } from '@/shared/utils/accountLabels';
import { formatMoney } from '@/shared/utils/format';
import { AppModal } from '@/shared/ui/Modal';

const transactionTypes: TransactionType[] = ['expense', 'income', 'transfer'];

type TemplateDraft = {
  name: string;
  type: TransactionType;
  amount: string;
  categoryId: string;
  accountId: string;
  toAccountId: string;
  fromSavingsGoalId: string;
  toSavingsGoalId: string;
  notes: string;
  isImpulseDefault: boolean;
};

const emptyDraft: TemplateDraft = {
  name: '',
  type: 'expense',
  amount: '',
  categoryId: '',
  accountId: '',
  toAccountId: '',
  fromSavingsGoalId: '',
  toSavingsGoalId: '',
  notes: '',
  isImpulseDefault: false,
};

export function TemplatesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [templates, setTemplates] = useState<TransactionTemplate[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [savingsList, setSavingsList] = useState<Savings[]>([]);
  const [draft, setDraft] = useState<TemplateDraft>(emptyDraft);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [overwritePrompt, setOverwritePrompt] = useState<{
    existing: TransactionTemplate;
    input: TemplateMutationInput;
  } | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    const [templateRows, accountRows, categoryRows, savingsRows] = await Promise.all([
      listTransactionTemplatesByUser(user.id),
      listAccountsByUser(user.id),
      listCategoriesByUser(user.id),
      listSavingsByUser(user.id),
    ]);
    setTemplates(templateRows);
    setAccounts(accountRows.filter((account) => !account.isArchived));
    setCategories(categoryRows);
    setSavingsList(savingsRows);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((error) => {
        setStatus(error instanceof Error ? error.message : 'Failed to load templates.');
      });
    }, [refresh])
  );

  const availableCategories = useMemo(
    () =>
      categories.filter((category) => {
        if (draft.type === 'transfer') return false;
        return category.type === 'both' || category.type === draft.type;
      }),
    [categories, draft.type]
  );

  function buildTemplateInput(): TemplateMutationInput | null {
    if (!user) return null;
    const name = draft.name.trim();
    const amount = draft.amount.trim() ? Number(draft.amount) : null;

    if (!name) {
      setStatus('Enter a template name.');
      return null;
    }
    if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) {
      setStatus('Amount must be blank or greater than zero.');
      return null;
    }

    return {
      userId: user.id,
      name,
      type: draft.type,
      defaultAmount: amount,
      accountId: draft.accountId || null,
      toAccountId: draft.type === 'transfer' ? draft.toAccountId || null : null,
      savingsGoalId:
        draft.type === 'income' || draft.type === 'transfer'
          ? draft.toSavingsGoalId || null
          : null,
      fromSavingsGoalId:
        draft.type === 'expense' || draft.type === 'transfer'
          ? draft.fromSavingsGoalId || null
          : null,
      categoryId: draft.type === 'transfer' ? null : draft.categoryId || null,
      notes: draft.notes || null,
      isPlannedDefault: draft.type === 'expense' && !draft.isImpulseDefault,
      isImpulseDefault: draft.type === 'expense' && draft.isImpulseDefault,
    };
  }

  async function handleCreateTemplate() {
    if (!user || saving) return;
    const input = buildTemplateInput();
    if (!input) return;

    try {
      setSaving(true);
      const conflict = await checkTransactionTemplateConflict(input);
      if (conflict?.kind === 'same-name') {
        setOverwritePrompt({ existing: conflict.template, input });
        return;
      }
      await createTransactionTemplate(input);
      setDraft(emptyDraft);
      setStatus('Template created.');
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to create template.');
    } finally {
      setSaving(false);
    }
  }

  async function handleOverwriteTemplate() {
    if (!overwritePrompt || saving) return;
    try {
      setSaving(true);
      await updateTransactionTemplate({
        id: overwritePrompt.existing.id,
        ...overwritePrompt.input,
      });
      setOverwritePrompt(null);
      setDraft(emptyDraft);
      setStatus('Template updated.');
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to update template.');
    } finally {
      setSaving(false);
    }
  }

  async function handleArchiveTemplate(template: TransactionTemplate) {
    if (!user) return;
    try {
      await archiveTransactionTemplate(user.id, template.id);
      setStatus('Template archived.');
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to archive template.');
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.pageTitle}>Templates</Text>
        <View style={{ width: 40 }} />
      </View>

      {status ? <Text style={styles.status}>{status}</Text> : null}

      <View style={[styles.card, shadows.small]}>
        <Text style={styles.cardTitle}>Create Template</Text>
        <TextInput
          value={draft.name}
          onChangeText={(name) => setDraft((current) => ({ ...current, name }))}
          placeholder="Template name"
          placeholderTextColor={colors.mutedInk}
          style={styles.input}
        />
        <TextInput
          value={draft.amount}
          onChangeText={(amount) => setDraft((current) => ({ ...current, amount }))}
          placeholder="Default amount"
          placeholderTextColor={colors.mutedInk}
          keyboardType="decimal-pad"
          style={styles.input}
        />
        <View style={styles.chipRow}>
          {transactionTypes.map((type) => (
            <Pressable
              key={type}
              onPress={() =>
                setDraft((current) => ({
                  ...current,
                  type,
                  categoryId: type === 'transfer' ? '' : current.categoryId,
                  isImpulseDefault: type === 'expense' ? current.isImpulseDefault : false,
                }))
              }
              style={[styles.chip, draft.type === type && styles.chipActive]}
            >
              <Text style={[styles.chipLabel, draft.type === type && styles.chipLabelActive]}>
                {capitalize(type)}
              </Text>
            </Pressable>
          ))}
        </View>

        {draft.type !== 'transfer' ? (
          <>
            <Text style={styles.selectorLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              <Pressable
                onPress={() => setDraft((current) => ({ ...current, categoryId: '' }))}
                style={[styles.chip, !draft.categoryId && styles.chipActive]}
              >
                <Text style={[styles.chipLabel, !draft.categoryId && styles.chipLabelActive]}>
                  None
                </Text>
              </Pressable>
              {availableCategories.map((category) => (
                <Pressable
                  key={category.id}
                  onPress={() => setDraft((current) => ({ ...current, categoryId: category.id }))}
                  style={[styles.chip, draft.categoryId === category.id && styles.chipActive]}
                >
                  <Text style={[styles.chipLabel, draft.categoryId === category.id && styles.chipLabelActive]}>
                    {category.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}

        <Text style={styles.selectorLabel}>
          {draft.type === 'transfer' ? 'Source account' : 'Account'}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Pressable
            onPress={() => setDraft((current) => ({ ...current, accountId: '' }))}
            style={[styles.chip, !draft.accountId && styles.chipActive]}
          >
            <Text style={[styles.chipLabel, !draft.accountId && styles.chipLabelActive]}>None</Text>
          </Pressable>
          {accounts.map((account) => (
            <Pressable
              key={account.id}
              onPress={() => setDraft((current) => ({ ...current, accountId: account.id }))}
              style={[styles.chip, draft.accountId === account.id && styles.chipActive]}
            >
              <Text style={[styles.chipLabel, draft.accountId === account.id && styles.chipLabelActive]}>
                {formatAccountLabel(account)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {draft.type === 'transfer' ? (
          <>
            <Text style={styles.selectorLabel}>Destination account</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {accounts.map((account) => (
                <Pressable
                  key={account.id}
                  onPress={() => setDraft((current) => ({ ...current, toAccountId: account.id }))}
                  style={[styles.chip, draft.toAccountId === account.id && styles.chipActive]}
                >
                  <Text style={[styles.chipLabel, draft.toAccountId === account.id && styles.chipLabelActive]}>
                    {formatAccountLabel(account)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}

        <TextInput
          value={draft.notes}
          onChangeText={(notes) => setDraft((current) => ({ ...current, notes }))}
          placeholder="Notes"
          placeholderTextColor={colors.mutedInk}
          style={styles.input}
        />

        {draft.type === 'expense' ? (
          <Pressable
            onPress={() =>
              setDraft((current) => ({
                ...current,
                isImpulseDefault: !current.isImpulseDefault,
              }))
            }
            style={[styles.flagRow, draft.isImpulseDefault && styles.flagRowActive]}
          >
            <Text style={[styles.flagText, draft.isImpulseDefault && styles.flagTextActive]}>
              Default as impulse spend
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={handleCreateTemplate}
          disabled={saving}
          style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
        >
          <Text style={styles.primaryButtonLabel}>{saving ? 'Saving...' : 'Create Template'}</Text>
        </Pressable>
      </View>

      <View style={[styles.card, shadows.small]}>
        <Text style={styles.cardTitle}>Saved Templates</Text>
        {templates.length === 0 ? (
          <Text style={styles.emptyText}>No templates yet.</Text>
        ) : (
          templates.map((template) => (
            <View key={template.id} style={styles.itemRow}>
              <View style={styles.itemCopy}>
                <Text style={styles.itemTitle}>{template.name}</Text>
                <Text style={styles.itemMeta}>{buildTemplateMeta(template, accounts, savingsList, categories)}</Text>
              </View>
              <View style={styles.itemActions}>
                <Text style={styles.itemAmount}>
                  {template.defaultAmount ? formatMoney(template.defaultAmount) : 'No amount'}
                </Text>
                <Pressable onPress={() => router.push(`/add-transaction?templateId=${template.id}` as any)}>
                  <Text style={styles.inlineAction}>Use</Text>
                </Pressable>
                <Pressable onPress={() => handleArchiveTemplate(template)}>
                  <Text style={styles.destructiveAction}>Archive</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </View>

      <AppModal
        visible={Boolean(overwritePrompt)}
        title="Rewrite Template?"
        message={
          overwritePrompt
            ? `A template named "${overwritePrompt.existing.name}" already exists with different values. Rewrite it with the new values?`
            : undefined
        }
        onRequestClose={() => setOverwritePrompt(null)}
        buttons={[
          {
            text: 'Cancel Template',
            style: 'cancel',
            onPress: () => setOverwritePrompt(null),
          },
          {
            text: saving ? 'Saving...' : 'Proceed',
            onPress: handleOverwriteTemplate,
          },
        ]}
      />
    </ScrollView>
  );
}

function buildTemplateMeta(
  template: TransactionTemplate,
  accounts: Account[],
  savingsList: Savings[],
  categories: Category[]
) {
  const category = categories.find((item) => item.id === template.categoryId);
  const source =
    accounts.find((item) => item.id === template.accountId)?.name ||
    savingsList.find((item) => item.id === template.fromSavingsGoalId)?.name ||
    savingsList.find((item) => item.id === template.savingsGoalId)?.name;

  return `${capitalize(template.type)} | ${formatTransactionAccountLabel(source)} | ${category?.name ?? 'Uncategorised'}`;
}

function capitalize(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 120, gap: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { fontSize: 22, fontWeight: '800', color: colors.ink },
  status: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  card: { backgroundColor: colors.surface, borderRadius: radii.xxl, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: 12, backgroundColor: colors.surfaceSecondary, color: colors.ink },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: radii.full, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surfaceSecondary },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipLabel: { color: colors.ink, fontWeight: '600', fontSize: 12 },
  chipLabelActive: { color: colors.surface },
  selectorLabel: { color: colors.mutedInk, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  flagRow: { borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.surfaceSecondary },
  flagRowActive: { backgroundColor: colors.warningLight, borderColor: colors.warning },
  flagText: { color: colors.ink, fontWeight: '600' },
  flagTextActive: { color: colors.warning },
  primaryButton: { backgroundColor: colors.primary, borderRadius: radii.lg, paddingVertical: 14, alignItems: 'center' },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonLabel: { color: colors.surface, fontWeight: '800', fontSize: 14 },
  emptyText: { color: colors.mutedInk, fontSize: 14, textAlign: 'center' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  itemCopy: { flex: 1, gap: 3 },
  itemTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  itemMeta: { color: colors.mutedInk, fontSize: 12 },
  itemActions: { alignItems: 'flex-end', gap: 8, maxWidth: 130 },
  itemAmount: { color: colors.ink, fontSize: 13, fontWeight: '700', textAlign: 'right' },
  inlineAction: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  destructiveAction: { color: colors.danger, fontSize: 12, fontWeight: '700' },
});
