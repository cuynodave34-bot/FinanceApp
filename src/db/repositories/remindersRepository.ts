import { getDatabase } from '@/db/sqlite/client';
import { defaultReminderSeeds } from '@/shared/constants/default-reminders';
import { createId } from '@/shared/utils/id';
import { nowIso } from '@/shared/utils/time';

export async function seedDefaultRemindersIfNeeded(userId: string) {
  const database = getDatabase();
  const existing = await database.getFirstAsync<{ total: number }>(
    `select count(1) as total from reminders where user_id = ?`,
    [userId]
  );

  if (existing?.total) {
    return;
  }

  for (const reminder of defaultReminderSeeds) {
    const timestamp = nowIso();
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
        createId(),
        userId,
        reminder.type,
        reminder.reminderTime,
        1,
        timestamp,
        timestamp,
      ]
    );
  }
}
