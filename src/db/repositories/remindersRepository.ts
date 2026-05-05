import { getDatabase } from '@/db/sqlite/client';
import { defaultReminderSeeds } from '@/shared/constants/default-reminders';
import { Reminder, ReminderType } from '@/shared/types/domain';
import { createId } from '@/shared/utils/id';
import { isTimeKey, nowIso } from '@/shared/utils/time';
import { buildSyncQueueItem } from '@/sync/queue/factory';
import { enqueueSyncItem } from '@/sync/queue/repository';

type ReminderRow = {
  id: string;
  userId: string;
  type: ReminderType;
  reminderTime: string;
  isEnabled: number;
  createdAt: string;
  updatedAt: string;
};

type UpdateReminderInput = {
  id: string;
  userId: string;
  reminderTime: string;
  isEnabled: boolean;
};

function mapReminder(row: ReminderRow): Reminder {
  return {
    ...row,
    isEnabled: Boolean(row.isEnabled),
  };
}

function normalizeReminderTime(value: string) {
  if (!isTimeKey(value)) {
    throw new Error('Reminder time must use HH:MM in 24-hour format.');
  }

  return value;
}

async function insertReminder(reminder: Reminder, shouldQueue: boolean) {
  const database = getDatabase();

  await database.runAsync(
    `insert into reminders (
      id,
      user_id,
      type,
      reminder_time,
      is_enabled,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?)`,
    [
      reminder.id,
      reminder.userId,
      reminder.type,
      reminder.reminderTime,
      reminder.isEnabled ? 1 : 0,
      reminder.createdAt,
      reminder.updatedAt,
    ]
  );

  if (shouldQueue) {
    await enqueueSyncItem(
      buildSyncQueueItem(reminder.userId, 'reminders', reminder.id, 'create', reminder)
    );
  }
}

export async function listRemindersByUser(userId: string) {
  const database = getDatabase();
  const rows = await database.getAllAsync<ReminderRow>(
    `select
      id,
      user_id as userId,
      type,
      reminder_time as reminderTime,
      is_enabled as isEnabled,
      created_at as createdAt,
      updated_at as updatedAt
    from reminders
    where user_id = ?
    order by case type
      when 'morning_checkin' then 0
      when 'afternoon_log' then 1
      when 'night_review' then 2
      else 3
    end asc`,
    [userId]
  );

  return rows.map(mapReminder);
}

export async function updateReminder(input: UpdateReminderInput) {
  const database = getDatabase();
  const updatedAt = nowIso();

  await database.runAsync(
    `update reminders
    set reminder_time = ?,
        is_enabled = ?,
        updated_at = ?
    where id = ? and user_id = ?`,
    [
      normalizeReminderTime(input.reminderTime),
      input.isEnabled ? 1 : 0,
      updatedAt,
      input.id,
      input.userId,
    ]
  );

  await enqueueSyncItem(
    buildSyncQueueItem(input.userId, 'reminders', input.id, 'update', {
      ...input,
      reminderTime: normalizeReminderTime(input.reminderTime),
      updatedAt,
    })
  );
}

export async function seedDefaultRemindersIfNeeded(userId: string) {
  const database = getDatabase();

  for (const reminder of defaultReminderSeeds) {
    const existing = await database.getFirstAsync<{ id: string }>(
      `select id from reminders where user_id = ? and type = ?`,
      [userId, reminder.type]
    );

    if (existing) continue;

    const timestamp = nowIso();
    await insertReminder(
      {
        id: createId(),
        userId,
        type: reminder.type,
        reminderTime: reminder.reminderTime,
        isEnabled: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      true
    );
  }
}
