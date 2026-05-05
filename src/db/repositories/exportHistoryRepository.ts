import { getDatabase } from '@/db/sqlite/client';
import { buildSyncQueueItem } from '@/sync/queue/factory';
import { enqueueSyncItem } from '@/sync/queue/repository';
import { createId } from '@/shared/utils/id';
import { nowIso } from '@/shared/utils/time';
import { normalizeRequiredTextInput } from '@/shared/validation/text';

export type ExportHistoryItem = {
  id: string;
  userId: string;
  exportType: string;
  fileFormat: string;
  createdAt: string;
  updatedAt: string;
};

type ExportHistoryRow = {
  id: string;
  userId: string;
  exportType: string;
  fileFormat: string;
  createdAt: string;
  updatedAt: string;
};

function mapExportHistory(row: ExportHistoryRow): ExportHistoryItem {
  return row;
}

export async function createExportHistoryItem(input: {
  userId: string;
  exportType: string;
  fileFormat: string;
}) {
  const database = getDatabase();
  const timestamp = nowIso();
  const item: ExportHistoryItem = {
    id: createId(),
    userId: input.userId,
    exportType: normalizeRequiredTextInput(input.exportType, {
      fieldName: 'Export type',
      maxLength: 40,
    }),
    fileFormat: normalizeRequiredTextInput(input.fileFormat, {
      fieldName: 'File format',
      maxLength: 16,
    }).toLowerCase(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await database.runAsync(
    `insert into export_history (
      id, user_id, export_type, file_format, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?)`,
    [item.id, item.userId, item.exportType, item.fileFormat, item.createdAt, item.updatedAt]
  );

  await enqueueSyncItem(
    buildSyncQueueItem(item.userId, 'export_history', item.id, 'create', item)
  );

  return item;
}

export async function listExportHistoryByUser(userId: string, limit = 20) {
  const database = getDatabase();
  const rows = await database.getAllAsync<ExportHistoryRow>(
    `select
      id,
      user_id as userId,
      export_type as exportType,
      file_format as fileFormat,
      created_at as createdAt,
      updated_at as updatedAt
    from export_history
    where user_id = ?
    order by created_at desc
    limit ?`,
    [userId, limit]
  );

  return rows.map(mapExportHistory);
}

export async function getLatestExportHistoryItem(userId: string) {
  const database = getDatabase();
  const row = await database.getFirstAsync<ExportHistoryRow>(
    `select
      id,
      user_id as userId,
      export_type as exportType,
      file_format as fileFormat,
      created_at as createdAt,
      updated_at as updatedAt
    from export_history
    where user_id = ?
    order by created_at desc
    limit 1`,
    [userId]
  );

  return row ? mapExportHistory(row) : null;
}
