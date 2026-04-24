import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { archiveAccount, createAccount, listAccountsByUser, updateAccount } from '@/db/repositories/accountsRepository';
import {
  createCategory,
  deleteCategory,
  listCategoriesByUser,
  updateCategory,
} from '@/db/repositories/categoriesRepository';
import { useAuth } from '@/features/auth/provider/AuthProvider';
import { colors } from '@/shared/theme/colors';
import { Account, AccountType, Category, CategoryType } from '@/shared/types/domain';
import { SectionCard } from '@/shared/ui/SectionCard';

const accountTypes: AccountType[] = ['cash', 'bank', 'e_wallet', 'other'];
const categoryTypes: CategoryType[] = ['expense', 'income', 'both'];

export function SettingsScreen() {
  const { user, signOut } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [accountDraft, setAccountDraft] = useState({
    id: '',
    name: '',
    type: 'cash' as AccountType,
    initialBalance: '',
    currency: 'PHP',
  });
  const [categoryDraft, setCategoryDraft] = useState({
    id: '',
    name: '',
    type: 'expense' as CategoryType,
    parentCategoryId: '',
  });

  const refresh = useCallback(async () => {
    if (!user) {
      return;
    }

    const [accountRows, categoryRows] = await Promise.all([
      listAccountsByUser(user.id),
      listCategoriesByUser(user.id),
    ]);

    setAccounts(accountRows);
    setCategories(categoryRows);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((error) => {
        setStatus(error instanceof Error ? error.message : 'Failed to load settings data.');
      });
    }, [refresh])
  );

  async function handleSaveAccount() {
    if (!user || !accountDraft.name.trim()) {
      return;
    }

    try {
      const initialBalance = Number(accountDraft.initialBalance || '0');

      if (accountDraft.id) {
        await updateAccount({
          id: accountDraft.id,
          userId: user.id,
          name: accountDraft.name,
          type: accountDraft.type,
          initialBalance,
          currency: accountDraft.currency.trim() || 'PHP',
          isArchived: false,
        });
        setStatus('Account updated.');
      } else {
        await createAccount({
          userId: user.id,
          name: accountDraft.name,
          type: accountDraft.type,
          initialBalance,
          currency: accountDraft.currency.trim() || 'PHP',
        });
        setStatus('Account created.');
      }

      setAccountDraft({
        id: '',
        name: '',
        type: 'cash',
        initialBalance: '',
        currency: 'PHP',
      });
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save account.');
    }
  }

  async function handleSaveCategory() {
    if (!user || !categoryDraft.name.trim()) {
      return;
    }

    try {
      if (categoryDraft.id) {
        await updateCategory({
          id: categoryDraft.id,
          userId: user.id,
          name: categoryDraft.name,
          type: categoryDraft.type,
          parentCategoryId: categoryDraft.parentCategoryId || null,
        });
        setStatus('Category updated.');
      } else {
        await createCategory({
          userId: user.id,
          name: categoryDraft.name,
          type: categoryDraft.type,
          parentCategoryId: categoryDraft.parentCategoryId || null,
        });
        setStatus('Category created.');
      }

      setCategoryDraft({
        id: '',
        name: '',
        type: 'expense',
        parentCategoryId: '',
      });
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save category.');
    }
  }

  async function handleArchiveAccount(id: string) {
    if (!user) {
      return;
    }

    await archiveAccount(id, user.id);
    setStatus('Account archived.');
    await refresh();
  }

  async function handleDeleteCategory(id: string) {
    if (!user) {
      return;
    }

    await deleteCategory(id, user.id);
    setStatus('Category deleted.');
    await refresh();
  }

  const parentOptions = categories.filter((category) => !category.parentCategoryId);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <Text style={styles.kicker}>Settings</Text>
        <Text style={styles.title}>Manage core finance data.</Text>
        <Text style={styles.subtitle}>
          Auth is live, session state is persisted, and this screen now manages
          the first local offline entities: accounts and categories.
        </Text>
        <Text style={styles.userLine}>{user?.email ?? 'No signed-in user'}</Text>
        <Pressable onPress={signOut} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonLabel}>Sign Out</Text>
        </Pressable>
        {status ? <Text style={styles.status}>{status}</Text> : null}
      </View>

      <SectionCard
        title={accountDraft.id ? 'Edit Account' : 'Add Account'}
        subtitle="Wallets, banks, e-wallets, and cash containers are all modeled here."
      >
        <TextInput
          value={accountDraft.name}
          onChangeText={(value) => setAccountDraft((current) => ({ ...current, name: value }))}
          placeholder="Account name"
          placeholderTextColor={colors.mutedInk}
          style={styles.input}
        />
        <TextInput
          value={accountDraft.initialBalance}
          onChangeText={(value) =>
            setAccountDraft((current) => ({ ...current, initialBalance: value }))
          }
          placeholder="Initial balance"
          placeholderTextColor={colors.mutedInk}
          keyboardType="decimal-pad"
          style={styles.input}
        />
        <TextInput
          value={accountDraft.currency}
          onChangeText={(value) => setAccountDraft((current) => ({ ...current, currency: value }))}
          placeholder="Currency"
          placeholderTextColor={colors.mutedInk}
          autoCapitalize="characters"
          style={styles.input}
        />
        <View style={styles.chipRow}>
          {accountTypes.map((type) => (
            <Pressable
              key={type}
              onPress={() => setAccountDraft((current) => ({ ...current, type }))}
              style={[
                styles.chip,
                accountDraft.type === type && styles.chipActive,
              ]}
            >
              <Text
                style={[
                  styles.chipLabel,
                  accountDraft.type === type && styles.chipLabelActive,
                ]}
              >
                {type}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={handleSaveAccount} style={styles.primaryButton}>
          <Text style={styles.primaryButtonLabel}>
            {accountDraft.id ? 'Update Account' : 'Create Account'}
          </Text>
        </Pressable>
      </SectionCard>

      <SectionCard
        title="Accounts"
        subtitle="Tap edit to load an account back into the form. Archive keeps history without hard deletion."
      >
        {accounts.length === 0 ? (
          <Text style={styles.emptyText}>No accounts yet.</Text>
        ) : (
          accounts.map((account) => (
            <View key={account.id} style={styles.itemRow}>
              <View style={styles.itemCopy}>
                <Text style={styles.itemTitle}>{account.name}</Text>
                <Text style={styles.itemMeta}>
                  {account.type} • {account.currency} {account.initialBalance.toFixed(2)}
                  {account.isArchived ? ' • archived' : ''}
                </Text>
              </View>
              <View style={styles.itemActions}>
                <Pressable
                  onPress={() =>
                    setAccountDraft({
                      id: account.id,
                      name: account.name,
                      type: account.type,
                      initialBalance: String(account.initialBalance),
                      currency: account.currency,
                    })
                  }
                >
                  <Text style={styles.inlineAction}>Edit</Text>
                </Pressable>
                {!account.isArchived ? (
                  <Pressable onPress={() => handleArchiveAccount(account.id)}>
                    <Text style={styles.inlineAction}>Archive</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))
        )}
      </SectionCard>

      <SectionCard
        title={categoryDraft.id ? 'Edit Category' : 'Add Category'}
        subtitle="Root categories and subcategories are both supported through the parent selector."
      >
        <TextInput
          value={categoryDraft.name}
          onChangeText={(value) => setCategoryDraft((current) => ({ ...current, name: value }))}
          placeholder="Category name"
          placeholderTextColor={colors.mutedInk}
          style={styles.input}
        />
        <View style={styles.chipRow}>
          {categoryTypes.map((type) => (
            <Pressable
              key={type}
              onPress={() => setCategoryDraft((current) => ({ ...current, type }))}
              style={[
                styles.chip,
                categoryDraft.type === type && styles.chipActive,
              ]}
            >
              <Text
                style={[
                  styles.chipLabel,
                  categoryDraft.type === type && styles.chipLabelActive,
                ]}
              >
                {type}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.selectorLabel}>Parent category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Pressable
            onPress={() =>
              setCategoryDraft((current) => ({ ...current, parentCategoryId: '' }))
            }
            style={[
              styles.chip,
              !categoryDraft.parentCategoryId && styles.chipActive,
            ]}
          >
            <Text
              style={[
                styles.chipLabel,
                !categoryDraft.parentCategoryId && styles.chipLabelActive,
              ]}
            >
              None
            </Text>
          </Pressable>
          {parentOptions.map((category) => (
            <Pressable
              key={category.id}
              onPress={() =>
                setCategoryDraft((current) => ({
                  ...current,
                  parentCategoryId: category.id,
                }))
              }
              style={[
                styles.chip,
                categoryDraft.parentCategoryId === category.id && styles.chipActive,
              ]}
            >
              <Text
                style={[
                  styles.chipLabel,
                  categoryDraft.parentCategoryId === category.id &&
                    styles.chipLabelActive,
                ]}
              >
                {category.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <Pressable onPress={handleSaveCategory} style={styles.primaryButton}>
          <Text style={styles.primaryButtonLabel}>
            {categoryDraft.id ? 'Update Category' : 'Create Category'}
          </Text>
        </Pressable>
      </SectionCard>

      <SectionCard
        title="Categories"
        subtitle="Default student-friendly categories are seeded locally on first sign-in."
      >
        {categories.length === 0 ? (
          <Text style={styles.emptyText}>No categories yet.</Text>
        ) : (
          categories.map((category) => (
            <View key={category.id} style={styles.itemRow}>
              <View style={styles.itemCopy}>
                <Text style={styles.itemTitle}>
                  {category.parentCategoryId ? '  • ' : ''}
                  {category.name}
                </Text>
                <Text style={styles.itemMeta}>{category.type}</Text>
              </View>
              <View style={styles.itemActions}>
                <Pressable
                  onPress={() =>
                    setCategoryDraft({
                      id: category.id,
                      name: category.name,
                      type: category.type,
                      parentCategoryId: category.parentCategoryId ?? '',
                    })
                  }
                >
                  <Text style={styles.inlineAction}>Edit</Text>
                </Pressable>
                <Pressable onPress={() => handleDeleteCategory(category.id)}>
                  <Text style={styles.inlineAction}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </SectionCard>
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
  userLine: {
    color: colors.ink,
    fontWeight: '600',
  },
  status: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.canvas,
  },
  chipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  chipLabel: {
    color: colors.ink,
    fontWeight: '600',
    fontSize: 12,
  },
  chipLabelActive: {
    color: colors.surface,
  },
  selectorLabel: {
    color: colors.mutedInk,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  primaryButton: {
    backgroundColor: colors.ink,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonLabel: {
    color: colors.surface,
    fontWeight: '800',
    fontSize: 14,
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.canvas,
  },
  secondaryButtonLabel: {
    color: colors.ink,
    fontWeight: '700',
  },
  emptyText: {
    color: colors.mutedInk,
    fontSize: 14,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  itemCopy: {
    flex: 1,
    gap: 3,
  },
  itemTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  itemMeta: {
    color: colors.mutedInk,
    fontSize: 12,
  },
  itemActions: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  inlineAction: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '700',
  },
});
