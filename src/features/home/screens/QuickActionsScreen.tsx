import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  archiveFavoriteAction,
  createFavoriteAction,
  listFavoriteActionsByUser,
  seedDefaultFavoriteActionsIfNeeded,
  updateFavoriteAction,
} from '@/db/repositories/favoriteActionsRepository';
import { useAuth } from '@/features/auth/provider/AuthProvider';
import { FavoriteAction } from '@/shared/types/domain';
import { colors, radii, shadows, spacing } from '@/shared/theme/colors';

const availableActions = [
  { label: 'Quick Add', icon: 'add-circle-outline', route: '/quick-add' },
  { label: 'Add Transaction', icon: 'create-outline', route: '/add-transaction' },
  { label: 'Lazy Entry', icon: 'time-outline', route: '/add-transaction?type=expense&lazy=1' },
  { label: 'Transfer', icon: 'swap-horizontal-outline', route: '/add-transaction?type=transfer' },
  { label: 'Templates', icon: 'copy-outline', route: '/templates' },
  { label: 'Trash', icon: 'trash-outline', route: '/trash' },
  { label: 'Budget', icon: 'wallet-outline', route: '/budget' },
  { label: 'Calendar', icon: 'calendar-outline', route: '/calendar' },
];

export function QuickActionsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [actions, setActions] = useState<FavoriteAction[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const canAddAction = actions.length < 4;
  const hasQuickAddPinned = actions.some((action) => getActionRoute(action) === '/quick-add');

  const refresh = useCallback(async () => {
    if (!user) return;
    await seedDefaultFavoriteActionsIfNeeded(user.id);
    setActions(await listFavoriteActionsByUser(user.id));
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((error) => {
        setStatus(error instanceof Error ? error.message : 'Failed to load quick actions.');
      });
    }, [refresh])
  );

  async function handleAdd(action: (typeof availableActions)[number]) {
    if (!user) return;
    if (!canAddAction) {
      setStatus('Home can show 4 custom quick actions plus Settings.');
      return;
    }
    if (action.route === '/quick-add' && hasQuickAddPinned) {
      setStatus('Quick Add is already pinned on Home.');
      return;
    }
    try {
      await createFavoriteAction({
        userId: user.id,
        actionType: 'route',
        label: action.label,
        icon: action.icon,
        position: actions.length,
        metadata: { route: action.route },
      });
      setStatus('Quick action added.');
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to add quick action.');
    }
  }

  async function handleMove(action: FavoriteAction, direction: -1 | 1) {
    if (!user) return;
    const index = actions.findIndex((item) => item.id === action.id);
    const target = actions[index + direction];
    if (!target) return;

    try {
      await Promise.all([
        updateFavoriteAction({ ...action, userId: user.id, position: target.position }),
        updateFavoriteAction({ ...target, userId: user.id, position: action.position }),
      ]);
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to reorder quick actions.');
    }
  }

  async function handleArchive(action: FavoriteAction) {
    if (!user) return;
    try {
      await archiveFavoriteAction(user.id, action.id);
      setStatus('Quick action removed.');
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to remove quick action.');
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.pageTitle}>Quick Actions</Text>
        <View style={{ width: 40 }} />
      </View>

      {status ? <Text style={styles.status}>{status}</Text> : null}

      <View style={[styles.card, shadows.small]}>
        <Text style={styles.cardTitle}>Pinned on Home</Text>
        {actions.length === 0 ? (
          <Text style={styles.emptyText}>No quick actions pinned.</Text>
        ) : (
          actions.map((action, index) => (
            <View key={action.id} style={styles.itemRow}>
              <View style={styles.actionPreview}>
                <Ionicons
                  name={(action.icon as keyof typeof Ionicons.glyphMap) || 'ellipse-outline'}
                  size={20}
                  color={colors.primary}
                />
                <View style={styles.itemCopy}>
                  <Text style={styles.itemTitle}>{action.label}</Text>
                  <Text style={styles.itemMeta}>{String(action.metadata.route ?? action.actionType)}</Text>
                </View>
              </View>
              <View style={styles.rowActions}>
                <Pressable onPress={() => handleMove(action, -1)} disabled={index === 0}>
                  <Text style={[styles.inlineAction, index === 0 && styles.disabledAction]}>Up</Text>
                </Pressable>
                <Pressable onPress={() => handleMove(action, 1)} disabled={index === actions.length - 1}>
                  <Text style={[styles.inlineAction, index === actions.length - 1 && styles.disabledAction]}>Down</Text>
                </Pressable>
                <Pressable onPress={() => handleArchive(action)}>
                  <Text style={styles.destructiveAction}>Remove</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={[styles.card, shadows.small]}>
        <Text style={styles.cardTitle}>Add Action</Text>
        {!canAddAction ? (
          <Text style={styles.helperText}>Remove one pinned action before adding another.</Text>
        ) : null}
        {availableActions.map((action) => (
          (() => {
            const quickAddDuplicate = action.route === '/quick-add' && hasQuickAddPinned;
            const disabled = !canAddAction || quickAddDuplicate;
            return (
          <Pressable
            key={action.route}
            onPress={() => handleAdd(action)}
            disabled={disabled}
            style={[styles.optionRow, disabled && styles.optionRowDisabled]}
          >
            <View style={styles.actionPreview}>
              <Ionicons name={action.icon as keyof typeof Ionicons.glyphMap} size={20} color={colors.primary} />
              <View style={styles.itemCopy}>
                <Text style={styles.itemTitle}>{action.label}</Text>
                <Text style={styles.itemMeta}>{action.route}</Text>
              </View>
            </View>
            <Ionicons name={quickAddDuplicate ? 'checkmark-circle-outline' : 'add-circle-outline'} size={20} color={disabled ? colors.mutedInk : colors.primary} />
          </Pressable>
            );
          })()
        ))}
      </View>
    </ScrollView>
  );
}

function getActionRoute(action: FavoriteAction) {
  return String(action.metadata.route ?? '');
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
  emptyText: { color: colors.mutedInk, fontSize: 14 },
  helperText: { color: colors.mutedInk, fontSize: 12, lineHeight: 18 },
  itemRow: { gap: spacing.sm, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  optionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  optionRowDisabled: { opacity: 0.45 },
  actionPreview: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  itemCopy: { flex: 1, gap: 3 },
  itemTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  itemMeta: { color: colors.mutedInk, fontSize: 12 },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  inlineAction: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  destructiveAction: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  disabledAction: { color: colors.mutedInk },
});
