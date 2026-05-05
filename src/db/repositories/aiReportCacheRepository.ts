import { ensurePriorityThreeDatabaseSchema, getDatabase } from '@/db/sqlite/client';
import { createId } from '@/shared/utils/id';
import { nowIso } from '@/shared/utils/time';

export type AiReportCacheType = 'where_money_went' | 'money_health';

export type AiReportCacheItem = {
  id: string;
  userId: string;
  cacheType: AiReportCacheType;
  cacheKey: string;
  content: string;
  sourceModel?: string | null;
  createdAt: string;
  updatedAt: string;
};

type AiReportCacheRow = {
  id: string;
  userId: string;
  cacheType: AiReportCacheType;
  cacheKey: string;
  content: string;
  sourceModel: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapCacheItem(row: AiReportCacheRow): AiReportCacheItem {
  return row;
}

export async function getAiReportCacheItem(
  userId: string,
  cacheType: AiReportCacheType,
  cacheKey: string
) {
  await ensurePriorityThreeDatabaseSchema();
  const database = getDatabase();
  const row = await database.getFirstAsync<AiReportCacheRow>(
    `select
      id,
      user_id as userId,
      cache_type as cacheType,
      cache_key as cacheKey,
      content,
      source_model as sourceModel,
      created_at as createdAt,
      updated_at as updatedAt
    from ai_report_cache
    where user_id = ? and cache_type = ? and cache_key = ?
    limit 1`,
    [userId, cacheType, cacheKey]
  );

  return row ? mapCacheItem(row) : null;
}

export async function upsertAiReportCacheItem({
  userId,
  cacheType,
  cacheKey,
  content,
  sourceModel,
}: {
  userId: string;
  cacheType: AiReportCacheType;
  cacheKey: string;
  content: string;
  sourceModel?: string | null;
}) {
  await ensurePriorityThreeDatabaseSchema();
  const database = getDatabase();
  const timestamp = nowIso();
  const item: AiReportCacheItem = {
    id: createId(),
    userId,
    cacheType,
    cacheKey,
    content: content.trim(),
    sourceModel: sourceModel ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await database.runAsync(
    `insert into ai_report_cache (
      id,
      user_id,
      cache_type,
      cache_key,
      content,
      source_model,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(user_id, cache_type, cache_key) do update set
      content = excluded.content,
      source_model = excluded.source_model,
      updated_at = excluded.updated_at`,
    [
      item.id,
      item.userId,
      item.cacheType,
      item.cacheKey,
      item.content,
      item.sourceModel ?? null,
      item.createdAt,
      item.updatedAt,
    ]
  );

  return item;
}
