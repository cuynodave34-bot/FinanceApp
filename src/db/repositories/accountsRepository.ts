import { getDatabase } from '@/db/sqlite/client';
import { buildSyncQueueItem } from '@/sync/queue/factory';
import { enqueueSyncItem } from '@/sync/queue/repository';
import { Account, AccountType } from '@/shared/types/domain';
import { createId } from '@/shared/utils/id';
import { nowIso } from '@/shared/utils/time';
import { normalizeMoneyAmount } from '@/shared/validation/money';
import { normalizeRequiredTextInput } from '@/shared/validation/text';

type AccountRow = {
  id: string;
  userId: string;
  name: string;
  type: AccountType;
  initialBalance: number;
  currency: string;
  isSpendable: number;
  isArchived: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type CreateAccountInput = {
  userId: string;
  name: string;
  type: AccountType;
  initialBalance?: number;
  currency?: string;
  isSpendable?: boolean;
};

type UpdateAccountInput = {
  id: string;
  userId: string;
  name: string;
  type: AccountType;
  initialBalance: number;
  currency: string;
  isSpendable: boolean;
  isArchived: boolean;
};

function mapAccount(row: AccountRow): Account {
  return {
    ...row,
    isSpendable: Boolean(row.isSpendable),
    isArchived: Boolean(row.isArchived),
  };
}

const allowedAccountTypes: AccountType[] = ['cash', 'bank', 'e_wallet', 'other'];

function normalizeAccountType(value: AccountType) {
  if (!allowedAccountTypes.includes(value)) {
    throw new Error('Invalid account type.');
  }

  return value;
}

function normalizeCurrency(value: string | undefined) {
  return normalizeRequiredTextInput(value ?? 'PHP', {
    fieldName: 'Currency',
    maxLength: 8,
  }).toUpperCase();
}

export async function listAccountsByUser(userId: string) {
  const database = getDatabase();
  const rows = await database.getAllAsync<AccountRow>(
    `select
      id,
      user_id as userId,
      name,
      type,
      initial_balance as initialBalance,
      currency,
      is_spendable as isSpendable,
      is_archived as isArchived,
      deleted_at as deletedAt,
      created_at as createdAt,
      updated_at as updatedAt
    from accounts
    where user_id = ? and deleted_at is null
    order by is_archived asc, created_at desc`,
    [userId]
  );

  return rows.map(mapAccount);
}

export async function createAccount(input: CreateAccountInput) {
  const database = getDatabase();
  const account: Account = {
    id: createId(),
    userId: input.userId,
    name: normalizeRequiredTextInput(input.name, { fieldName: 'Account name', maxLength: 80 }),
    type: normalizeAccountType(input.type),
    initialBalance: normalizeMoneyAmount(input.initialBalance ?? 0, {
      fieldName: 'Initial balance',
      allowZero: true,
      allowNegative: true,
    }),
    currency: normalizeCurrency(input.currency),
    isSpendable: input.isSpendable ?? true,
    isArchived: false,
    deletedAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  await database.runAsync(
    `insert into accounts (
      id,
      user_id,
      name,
      type,
      initial_balance,
      currency,
      is_spendable,
      is_archived,
      deleted_at,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      account.id,
      account.userId,
      account.name,
      account.type,
      account.initialBalance,
      account.currency,
      account.isSpendable ? 1 : 0,
      0,
      null,
      account.createdAt,
      account.updatedAt,
    ]
  );

  await enqueueSyncItem(
    buildSyncQueueItem(account.userId, 'accounts', account.id, 'create', account)
  );

  return account;
}

export async function updateAccount(input: UpdateAccountInput) {
  const database = getDatabase();
  const updatedAt = nowIso();

  await database.runAsync(
    `update accounts
    set name = ?,
        type = ?,
        initial_balance = ?,
        currency = ?,
        is_spendable = ?,
        is_archived = ?,
        updated_at = ?
    where id = ? and user_id = ?`,
    [
      normalizeRequiredTextInput(input.name, { fieldName: 'Account name', maxLength: 80 }),
      normalizeAccountType(input.type),
      normalizeMoneyAmount(input.initialBalance, {
        fieldName: 'Initial balance',
        allowZero: true,
        allowNegative: true,
      }),
      normalizeCurrency(input.currency),
      input.isSpendable ? 1 : 0,
      input.isArchived ? 1 : 0,
      updatedAt,
      input.id,
      input.userId,
    ]
  );

  const payload = { ...input, updatedAt };
  await enqueueSyncItem(
    buildSyncQueueItem(input.userId, 'accounts', input.id, 'update', payload)
  );
}

export async function archiveAccount(id: string, userId: string) {
  const database = getDatabase();
  const updatedAt = nowIso();

  await database.runAsync(
    `update accounts
    set is_archived = 1,
        updated_at = ?
    where id = ? and user_id = ?`,
    [updatedAt, id, userId]
  );

  await enqueueSyncItem(
    buildSyncQueueItem(userId, 'accounts', id, 'update', {
      id,
      userId,
      isArchived: true,
      updatedAt,
    })
  );
}
