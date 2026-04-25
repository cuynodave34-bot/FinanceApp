import { getDatabase } from '@/db/sqlite/client';
import { buildSyncQueueItem } from '@/sync/queue/factory';
import { enqueueSyncItem } from '@/sync/queue/repository';
import { seedDefaultRemindersIfNeeded } from '@/db/repositories/remindersRepository';
import { seedDefaultCategoriesIfNeeded } from '@/db/repositories/categoriesRepository';

/**
 * One-time cleanup for duplicate reminders caused by a race condition
 * in the bootstrap flow. Call this from a debug screen or console.
 *
 * Keeps the oldest reminder per type, deletes the rest, clears
 * reminder sync-queue items, and re-queues creates for survivors.
 */
export async function deduplicateRemindersAndRepairQueue(userId: string) {
  const database = getDatabase();

  // 1. Identify duplicate reminders (keep oldest per type)
  const rows = await database.getAllAsync<{ id: string; type: string; reminder_time: string; is_enabled: number; created_at: string }>(
    `select id, type, reminder_time, is_enabled, created_at
     from reminders
     where user_id = ?
     order by type, created_at asc`,
    [userId]
  );

  const survivors = new Map<string, typeof rows[0]>();
  const duplicates: string[] = [];

  for (const row of rows) {
    if (!survivors.has(row.type)) {
      survivors.set(row.type, row);
    } else {
      duplicates.push(row.id);
    }
  }

  if (duplicates.length === 0) {
    console.log('[Cleanup] No duplicate reminders found.');
    return;
  }

  console.log(`[Cleanup] Found ${duplicates.length} duplicate reminders to remove.`);

  // 2. Delete duplicate reminders
  const placeholders = duplicates.map(() => '?').join(',');
  await database.runAsync(
    `delete from reminders where id in (${placeholders})`,
    duplicates
  );

  // 3. Delete ALL reminder sync-queue entries (both creates for duplicates and any updates)
  await database.runAsync(
    `delete from sync_queue where entity_type = 'reminders'`
  );

  // 4. Re-queue create sync items for the survivors
  for (const [, row] of survivors) {
    await enqueueSyncItem(
      buildSyncQueueItem(userId, 'reminders', row.id, 'create', {
        id: row.id,
        userId,
        type: row.type,
        reminderTime: row.reminder_time,
        isEnabled: Boolean(row.is_enabled),
        createdAt: row.created_at,
        updatedAt: row.created_at,
      })
    );
  }

  console.log(`[Cleanup] Kept ${survivors.size} reminders, removed ${duplicates.length} duplicates, re-queued ${survivors.size} sync items.`);
}

/**
 * Full reset of local reminders + sync queue for this user.
 * Useful if the deduplication above is not enough.
 * Will re-seed defaults (losing any custom times/settings).
 */
export async function resetRemindersAndQueue(userId: string) {
  const database = getDatabase();

  await database.runAsync(`delete from reminders where user_id = ?`, [userId]);
  await database.runAsync(`delete from sync_queue where entity_type = 'reminders'`);

  await seedDefaultRemindersIfNeeded(userId);

  console.log('[Cleanup] Reminders reset and re-seeded.');
}

/**
 * Deduplicate categories seeded multiple times by the same race condition.
 * Keeps the oldest category per (name, parent) and deletes the rest.
 */
export async function deduplicateCategories(userId: string) {
  const database = getDatabase();

  const rows = await database.getAllAsync<{
    id: string;
    name: string;
    parent_category_id: string | null;
    created_at: string;
  }>(
    `select id, name, parent_category_id, created_at
     from categories
     where user_id = ? and deleted_at is null
     order by name, coalesce(parent_category_id, ''), created_at asc`,
    [userId]
  );

  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const row of rows) {
    const key = `${row.name}::${row.parent_category_id ?? ''}`;
    if (seen.has(key)) {
      duplicates.push(row.id);
    } else {
      seen.add(key);
    }
  }

  if (duplicates.length === 0) {
    console.log('[Cleanup] No duplicate categories found.');
    return;
  }

  const placeholders = duplicates.map(() => '?').join(',');
  await database.runAsync(
    `delete from categories where id in (${placeholders})`,
    duplicates
  );

  // Also remove any sync-queue entries for deleted category IDs
  await database.runAsync(
    `delete from sync_queue where entity_type = 'categories' and entity_id in (${placeholders})`,
    duplicates
  );

  console.log(`[Cleanup] Removed ${duplicates.length} duplicate categories.`);
}
