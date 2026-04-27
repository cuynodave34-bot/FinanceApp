import * as SQLite from 'expo-sqlite';

import { runMigrations } from '@/db/sqlite/migrations';

const database = SQLite.openDatabaseSync('student-finance.db');

let initialized = false;

export async function initializeDatabase() {
  if (initialized) {
    return database;
  }

  await runMigrations((statement) => database.execAsync(statement));
  await database.execAsync('delete from ai_chat_memory;');
  initialized = true;

  return database;
}

export function getDatabase() {
  return database;
}
