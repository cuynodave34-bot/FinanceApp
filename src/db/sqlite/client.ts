import * as SQLite from 'expo-sqlite';

import {
  ensurePriorityOneSchema,
  ensurePriorityFourSchema,
  ensurePriorityThreeSchema,
  ensurePriorityTwoSchema,
  runMigrations,
} from '@/db/sqlite/migrations';

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

export async function ensurePriorityOneDatabaseSchema() {
  await ensurePriorityOneSchema((statement) => database.execAsync(statement));
}

export async function ensurePriorityTwoDatabaseSchema() {
  await ensurePriorityOneDatabaseSchema();
  await ensurePriorityTwoSchema((statement) => database.execAsync(statement));
}

export async function ensurePriorityThreeDatabaseSchema() {
  await ensurePriorityTwoDatabaseSchema();
  await ensurePriorityThreeSchema((statement) => database.execAsync(statement));
}

export async function ensurePriorityFourDatabaseSchema() {
  await ensurePriorityThreeDatabaseSchema();
  await ensurePriorityFourSchema((statement) => database.execAsync(statement));
}
