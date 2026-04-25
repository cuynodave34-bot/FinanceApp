import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  createCategory,
  deleteCategory,
  listCategoriesByUser,
  updateCategory,
} from '@/db/repositories/categoriesRepository';
import { useAuth } from '@/features/auth/provider/AuthProvider';
import { colors, spacing, radii, shadows } from '@/shared/theme/colors';
import { Category, CategoryType } from '@/shared/types/domain';

const categoryTypes: CategoryType[] = ['expense', 'income', 'both'];

export function CategoriesScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [categoryDraft, setCategoryDraft] = useState({
    id: '',
    name: '',
    type: 'expense' as CategoryType,
    parentCategoryId: '',
  });

  const refresh = useCallback(async () => {
    if (!user) return;
    const rows = await listCategoriesByUser(user.id);
    setCategories(rows);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((error) => {
        setStatus(error instanceof Error ? error.message : 'Failed to load categories.');
      });
    }, [refresh])
  );

  async function handleSaveCategory() {
    if (!user || !categoryDraft.name.trim()) return;
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
      setCategoryDraft({ id: '', name: '', type: 'expense', parentCategoryId: '' });
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save category.');
    }
  }

  async function handleDeleteCategory(id: string) {
    if (!user) return;
    await deleteCategory(id, user.id);
    setStatus('Category deleted.');
    await refresh();
  }

  const parentOptions = categories.filter((category) => !category.parentCategoryId);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.pageTitle}>Categories</Text>
        <View style={{ width: 40 }} />
      </View>
      {status ? <Text style={styles.status}>{status}</Text> : null}

      <View style={[styles.card, shadows.small]}>
        <Text style={styles.cardTitle}>{categoryDraft.id ? 'Edit Category' : 'Add Category'}</Text>
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
              style={[styles.chip, categoryDraft.type === type && styles.chipActive]}
            >
              <Text style={[styles.chipLabel, categoryDraft.type === type && styles.chipLabelActive]}>
                {type}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.selectorLabel}>Parent category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Pressable
            onPress={() => setCategoryDraft((current) => ({ ...current, parentCategoryId: '' }))}
            style={[styles.chip, !categoryDraft.parentCategoryId && styles.chipActive]}
          >
            <Text style={[styles.chipLabel, !categoryDraft.parentCategoryId && styles.chipLabelActive]}>
              None
            </Text>
          </Pressable>
          {parentOptions.map((category) => (
            <Pressable
              key={category.id}
              onPress={() => setCategoryDraft((current) => ({ ...current, parentCategoryId: category.id }))}
              style={[styles.chip, categoryDraft.parentCategoryId === category.id && styles.chipActive]}
            >
              <Text style={[styles.chipLabel, categoryDraft.parentCategoryId === category.id && styles.chipLabelActive]}>
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
      </View>

      <View style={[styles.card, shadows.small]}>
        <Text style={styles.cardTitle}>Your Categories</Text>
        {categories.length === 0 ? (
          <Text style={styles.emptyText}>No categories yet.</Text>
        ) : (
          categories.map((category) => (
            <View key={category.id} style={styles.itemRow}>
              <View style={styles.itemCopy}>
                <Text style={styles.itemTitle}>
                  {category.parentCategoryId ? '  - ' : ''}
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: radii.full, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surfaceSecondary },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipLabel: { color: colors.ink, fontWeight: '600', fontSize: 12 },
  chipLabelActive: { color: colors.surface },
  selectorLabel: { color: colors.mutedInk, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  primaryButton: { backgroundColor: colors.primary, borderRadius: radii.lg, paddingVertical: 14, alignItems: 'center' },
  primaryButtonLabel: { color: colors.surface, fontWeight: '800', fontSize: 14 },
  emptyText: { color: colors.mutedInk, fontSize: 14 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  itemCopy: { flex: 1, gap: 3 },
  itemTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  itemMeta: { color: colors.mutedInk, fontSize: 12 },
  itemActions: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  inlineAction: { color: colors.primary, fontSize: 12, fontWeight: '700' },
});
