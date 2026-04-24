import { getDatabase } from '@/db/sqlite/client';
import { defaultCategorySeeds } from '@/shared/constants/default-categories';
import { Category, CategoryType } from '@/shared/types/domain';
import { createId } from '@/shared/utils/id';
import { nowIso } from '@/shared/utils/time';
import { buildSyncQueueItem } from '@/sync/queue/factory';
import { enqueueSyncItem } from '@/sync/queue/repository';

type CategoryRow = {
  id: string;
  userId: string;
  name: string;
  type: CategoryType;
  parentCategoryId: string | null;
  icon: string | null;
  color: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type CreateCategoryInput = {
  userId: string;
  name: string;
  type: CategoryType;
  parentCategoryId?: string | null;
};

type UpdateCategoryInput = {
  id: string;
  userId: string;
  name: string;
  type: CategoryType;
  parentCategoryId?: string | null;
};

function mapCategory(row: CategoryRow): Category {
  return row;
}

async function insertCategory(category: Category, shouldQueue: boolean) {
  const database = getDatabase();

  await database.runAsync(
    `insert into categories (
      id,
      user_id,
      name,
      type,
      parent_category_id,
      icon,
      color,
      deleted_at,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      category.id,
      category.userId,
      category.name,
      category.type,
      category.parentCategoryId ?? null,
      category.icon ?? null,
      category.color ?? null,
      category.deletedAt ?? null,
      category.createdAt,
      category.updatedAt,
    ]
  );

  if (shouldQueue) {
    await enqueueSyncItem(
      buildSyncQueueItem(
        category.userId,
        'categories',
        category.id,
        'create',
        category
      )
    );
  }
}

export async function listCategoriesByUser(userId: string) {
  const database = getDatabase();
  const rows = await database.getAllAsync<CategoryRow>(
    `select
      id,
      user_id as userId,
      name,
      type,
      parent_category_id as parentCategoryId,
      icon,
      color,
      deleted_at as deletedAt,
      created_at as createdAt,
      updated_at as updatedAt
    from categories
    where user_id = ? and deleted_at is null
    order by case when parent_category_id is null then 0 else 1 end, name asc`,
    [userId]
  );

  return rows.map(mapCategory);
}

export async function createCategory(input: CreateCategoryInput) {
  const category: Category = {
    id: createId(),
    userId: input.userId,
    name: input.name.trim(),
    type: input.type,
    parentCategoryId: input.parentCategoryId ?? null,
    icon: null,
    color: null,
    deletedAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  await insertCategory(category, true);
  return category;
}

export async function updateCategory(input: UpdateCategoryInput) {
  const database = getDatabase();
  const updatedAt = nowIso();

  await database.runAsync(
    `update categories
    set name = ?,
        type = ?,
        parent_category_id = ?,
        updated_at = ?
    where id = ? and user_id = ?`,
    [
      input.name.trim(),
      input.type,
      input.parentCategoryId ?? null,
      updatedAt,
      input.id,
      input.userId,
    ]
  );

  await enqueueSyncItem(
    buildSyncQueueItem(input.userId, 'categories', input.id, 'update', {
      ...input,
      updatedAt,
    })
  );
}

export async function deleteCategory(id: string, userId: string) {
  const database = getDatabase();
  const deletedAt = nowIso();

  await database.runAsync(
    `update categories
    set deleted_at = ?,
        updated_at = ?
    where id = ? and user_id = ?`,
    [deletedAt, deletedAt, id, userId]
  );

  await enqueueSyncItem(
    buildSyncQueueItem(userId, 'categories', id, 'delete', {
      id,
      deletedAt,
    })
  );
}

export async function seedDefaultCategoriesIfNeeded(userId: string) {
  const database = getDatabase();
  const existing = await database.getFirstAsync<{ total: number }>(
    `select count(1) as total from categories where user_id = ? and deleted_at is null`,
    [userId]
  );

  if (existing?.total) {
    return;
  }

  for (const seed of defaultCategorySeeds) {
    const parent: Category = {
      id: createId(),
      userId,
      name: seed.name,
      type: seed.type,
      parentCategoryId: null,
      icon: null,
      color: null,
      deletedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    await insertCategory(parent, true);

    for (const childName of seed.children ?? []) {
      const child: Category = {
        id: createId(),
        userId,
        name: childName,
        type: seed.type,
        parentCategoryId: parent.id,
        icon: null,
        color: null,
        deletedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };

      await insertCategory(child, true);
    }
  }
}
