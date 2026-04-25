import { sqliteSchema } from '@/db/sqlite/schema';

export async function runMigrations(execute: (statement: string) => Promise<void>) {
  const statements = sqliteSchema
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await execute(`${statement};`);
  }

  await runAlterMigrations(execute);
}

async function runAlterMigrations(execute: (statement: string) => Promise<void>) {
  const newColumns = [
    { table: 'accounts', column: 'is_spendable', type: 'integer' },
    { table: 'transactions', column: 'photo_url', type: 'text' },
    { table: 'transactions', column: 'location_name', type: 'text' },
    { table: 'transactions', column: 'latitude', type: 'real' },
    { table: 'transactions', column: 'longitude', type: 'real' },
    { table: 'transactions', column: 'savings_goal_id', type: 'text' },
    { table: 'transactions', column: 'from_savings_goal_id', type: 'text' },
    { table: 'debts', column: 'debt_type', type: 'text' },
    { table: 'debts', column: 'status', type: 'text' },
    { table: 'debts', column: 'linked_transaction_id', type: 'text' },
  ];

  for (const { table, column, type } of newColumns) {
    try {
      await execute(`alter table ${table} add column ${column} ${type};`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('duplicate column name')) {
        continue;
      }
      throw error;
    }
  }
}
