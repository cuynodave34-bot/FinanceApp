import { sqliteSchema } from '@/db/sqlite/schema';

export async function runMigrations(execute: (statement: string) => Promise<void>) {
  const statements = sqliteSchema
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await execute(`${statement};`);
  }
}
