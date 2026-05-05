import { ensurePriorityOneDatabaseSchema, getDatabase } from '@/db/sqlite/client';
import { TransactionTemplate, TransactionType } from '@/shared/types/domain';
import { createId } from '@/shared/utils/id';
import { nowIso } from '@/shared/utils/time';
import { normalizeMoneyAmount } from '@/shared/validation/money';
import { normalizeRequiredTextInput, normalizeTextInput } from '@/shared/validation/text';
import { buildSyncQueueItem } from '@/sync/queue/factory';
import { enqueueSyncItem } from '@/sync/queue/repository';

type TransactionTemplateRow = {
  id: string;
  userId: string;
  name: string;
  type: TransactionType;
  defaultAmount: number | null;
  categoryId: string | null;
  subcategoryId: string | null;
  accountId: string | null;
  toAccountId: string | null;
  savingsGoalId: string | null;
  fromSavingsGoalId: string | null;
  notes: string | null;
  isPlannedDefault: number;
  isImpulseDefault: number;
  isArchived: number;
  createdAt: string;
  updatedAt: string;
};

export type TemplateMutationInput = {
  userId: string;
  name: string;
  type: TransactionType;
  defaultAmount?: number | null;
  categoryId?: string | null;
  subcategoryId?: string | null;
  accountId?: string | null;
  toAccountId?: string | null;
  savingsGoalId?: string | null;
  fromSavingsGoalId?: string | null;
  notes?: string | null;
  isPlannedDefault?: boolean;
  isImpulseDefault?: boolean;
  isArchived?: boolean;
};

type UpdateTemplateInput = TemplateMutationInput & {
  id: string;
};

function mapTemplate(row: TransactionTemplateRow): TransactionTemplate {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    type: row.type,
    defaultAmount: row.defaultAmount,
    categoryId: row.categoryId,
    subcategoryId: row.subcategoryId,
    accountId: row.accountId,
    toAccountId: row.toAccountId,
    savingsGoalId: row.savingsGoalId,
    fromSavingsGoalId: row.fromSavingsGoalId,
    notes: row.notes,
    isPlannedDefault: Boolean(row.isPlannedDefault),
    isImpulseDefault: Boolean(row.isImpulseDefault),
    isArchived: Boolean(row.isArchived),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const allowedTransactionTypes: TransactionType[] = ['income', 'expense', 'transfer'];

function normalizeTemplateType(type: TransactionType) {
  if (!allowedTransactionTypes.includes(type)) {
    throw new Error('Invalid template transaction type.');
  }

  return type;
}

function normalizeDefaultAmount(value: number | null | undefined) {
  if (value === null || value === undefined) return null;

  return normalizeMoneyAmount(value, { fieldName: 'Default amount' });
}

function normalizeTemplateInput(input: TemplateMutationInput) {
  return {
    userId: input.userId,
    name: normalizeRequiredTextInput(input.name, { fieldName: 'Template name', maxLength: 80 }),
    type: normalizeTemplateType(input.type),
    defaultAmount: normalizeDefaultAmount(input.defaultAmount),
    categoryId: input.categoryId ?? null,
    subcategoryId: input.subcategoryId ?? null,
    accountId: input.accountId ?? null,
    toAccountId: input.toAccountId ?? null,
    savingsGoalId: input.savingsGoalId ?? null,
    fromSavingsGoalId: input.fromSavingsGoalId ?? null,
    notes: normalizeTextInput(input.notes, { fieldName: 'Template notes', maxLength: 1000 }),
    isPlannedDefault: input.isPlannedDefault ?? false,
    isImpulseDefault: input.isImpulseDefault ?? false,
    isArchived: input.isArchived ?? false,
  };
}

export async function listTransactionTemplatesByUser(userId: string) {
  await ensurePriorityOneDatabaseSchema();
  const database = getDatabase();
  const rows = await database.getAllAsync<TransactionTemplateRow>(
    `select
      id,
      user_id as userId,
      name,
      type,
      default_amount as defaultAmount,
      category_id as categoryId,
      subcategory_id as subcategoryId,
      account_id as accountId,
      to_account_id as toAccountId,
      savings_goal_id as savingsGoalId,
      from_savings_goal_id as fromSavingsGoalId,
      notes,
      is_planned_default as isPlannedDefault,
      is_impulse_default as isImpulseDefault,
      is_archived as isArchived,
      created_at as createdAt,
      updated_at as updatedAt
    from transaction_templates
    where user_id = ? and is_archived = 0
    order by updated_at desc, created_at desc`,
    [userId]
  );

  return rows.map(mapTemplate);
}

export async function getTransactionTemplateById(userId: string, id: string) {
  await ensurePriorityOneDatabaseSchema();
  const database = getDatabase();
  const row = await database.getFirstAsync<TransactionTemplateRow>(
    `select
      id,
      user_id as userId,
      name,
      type,
      default_amount as defaultAmount,
      category_id as categoryId,
      subcategory_id as subcategoryId,
      account_id as accountId,
      to_account_id as toAccountId,
      savings_goal_id as savingsGoalId,
      from_savings_goal_id as fromSavingsGoalId,
      notes,
      is_planned_default as isPlannedDefault,
      is_impulse_default as isImpulseDefault,
      is_archived as isArchived,
      created_at as createdAt,
      updated_at as updatedAt
    from transaction_templates
    where id = ? and user_id = ? and is_archived = 0`,
    [id, userId]
  );

  return row ? mapTemplate(row) : null;
}

export async function createTransactionTemplate(input: TemplateMutationInput) {
  await ensurePriorityOneDatabaseSchema();
  const normalized = normalizeTemplateInput(input);
  const conflict = await checkTransactionTemplateConflict(normalized);
  if (conflict?.kind === 'exact') {
    throw new Error('This template already exists.');
  }
  const timestamp = nowIso();
  const template: TransactionTemplate = {
    id: createId(),
    ...normalized,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await insertTemplate(template);
  await enqueueSyncItem(
    buildSyncQueueItem(template.userId, 'transaction_templates', template.id, 'create', template)
  );

  return template;
}

export async function checkTransactionTemplateConflict(input: TemplateMutationInput) {
  const existingTemplates = await listTransactionTemplatesByUser(input.userId);
  const normalizedInput = normalizeTemplateForComparison(input);

  for (const template of existingTemplates) {
    const normalizedTemplate = normalizeTemplateForComparison(template);

    if (isExactTemplateMatch(normalizedTemplate, normalizedInput)) {
      return { kind: 'exact' as const, template };
    }

    if (
      normalizedTemplate.name === normalizedInput.name &&
      !isExactTemplateMatch(normalizedTemplate, normalizedInput)
    ) {
      return { kind: 'same-name' as const, template };
    }
  }

  return null;
}

function normalizeTemplateForComparison(
  template: TemplateMutationInput | TransactionTemplate
) {
  return {
    name: template.name.trim().toLowerCase(),
    type: template.type,
    defaultAmount:
      template.defaultAmount === undefined || template.defaultAmount === null
        ? null
        : Number(template.defaultAmount.toFixed(2)),
    categoryId: template.categoryId ?? null,
    subcategoryId: template.subcategoryId ?? null,
    accountId: template.accountId ?? null,
    toAccountId: template.toAccountId ?? null,
    savingsGoalId: template.savingsGoalId ?? null,
    fromSavingsGoalId: template.fromSavingsGoalId ?? null,
    notes: template.notes?.trim().toLowerCase() || null,
    isPlannedDefault: Boolean(template.isPlannedDefault),
    isImpulseDefault: Boolean(template.isImpulseDefault),
  };
}

function isExactTemplateMatch(
  left: ReturnType<typeof normalizeTemplateForComparison>,
  right: ReturnType<typeof normalizeTemplateForComparison>
) {
  return (
    left.name === right.name &&
    left.type === right.type &&
    left.defaultAmount === right.defaultAmount &&
    left.categoryId === right.categoryId &&
    left.subcategoryId === right.subcategoryId &&
    left.accountId === right.accountId &&
    left.toAccountId === right.toAccountId &&
    left.savingsGoalId === right.savingsGoalId &&
    left.fromSavingsGoalId === right.fromSavingsGoalId &&
    left.notes === right.notes &&
    left.isPlannedDefault === right.isPlannedDefault &&
    left.isImpulseDefault === right.isImpulseDefault
  );
}

export async function updateTransactionTemplate(input: UpdateTemplateInput) {
  await ensurePriorityOneDatabaseSchema();
  const database = getDatabase();
  const updatedAt = nowIso();
  const normalized = normalizeTemplateInput(input);
  const payload: TransactionTemplate = {
    id: input.id,
    ...normalized,
    createdAt: updatedAt,
    updatedAt,
  };

  await database.runAsync(
    `update transaction_templates
     set name = ?,
         type = ?,
         default_amount = ?,
         category_id = ?,
         subcategory_id = ?,
         account_id = ?,
         to_account_id = ?,
         savings_goal_id = ?,
         from_savings_goal_id = ?,
         notes = ?,
         is_planned_default = ?,
         is_impulse_default = ?,
         is_archived = ?,
         updated_at = ?
     where id = ? and user_id = ?`,
    [
      payload.name,
      payload.type,
      payload.defaultAmount ?? null,
      payload.categoryId ?? null,
      payload.subcategoryId ?? null,
      payload.accountId ?? null,
      payload.toAccountId ?? null,
      payload.savingsGoalId ?? null,
      payload.fromSavingsGoalId ?? null,
      payload.notes ?? null,
      payload.isPlannedDefault ? 1 : 0,
      payload.isImpulseDefault ? 1 : 0,
      payload.isArchived ? 1 : 0,
      updatedAt,
      payload.id,
      payload.userId,
    ]
  );

  await enqueueSyncItem(
    buildSyncQueueItem(input.userId, 'transaction_templates', input.id, 'update', {
      ...payload,
      updatedAt,
    })
  );
}

export async function archiveTransactionTemplate(userId: string, id: string) {
  await ensurePriorityOneDatabaseSchema();
  const database = getDatabase();
  const updatedAt = nowIso();

  await database.runAsync(
    `update transaction_templates
     set is_archived = 1,
         updated_at = ?
     where id = ? and user_id = ?`,
    [updatedAt, id, userId]
  );

  await enqueueSyncItem(
    buildSyncQueueItem(userId, 'transaction_templates', id, 'update', {
      id,
      userId,
      isArchived: true,
      updatedAt,
    })
  );
}

async function insertTemplate(template: TransactionTemplate) {
  const database = getDatabase();
  await database.runAsync(
    `insert into transaction_templates (
      id,
      user_id,
      name,
      type,
      default_amount,
      category_id,
      subcategory_id,
      account_id,
      to_account_id,
      savings_goal_id,
      from_savings_goal_id,
      notes,
      is_planned_default,
      is_impulse_default,
      is_archived,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      template.id,
      template.userId,
      template.name,
      template.type,
      template.defaultAmount ?? null,
      template.categoryId ?? null,
      template.subcategoryId ?? null,
      template.accountId ?? null,
      template.toAccountId ?? null,
      template.savingsGoalId ?? null,
      template.fromSavingsGoalId ?? null,
      template.notes ?? null,
      template.isPlannedDefault ? 1 : 0,
      template.isImpulseDefault ? 1 : 0,
      template.isArchived ? 1 : 0,
      template.createdAt,
      template.updatedAt,
    ]
  );
}
