import { ReminderType } from '@/shared/types/domain';

export const defaultReminderSeeds: Array<{
  type: ReminderType;
  reminderTime: string;
}> = [
  { type: 'morning_checkin', reminderTime: '08:00' },
  { type: 'afternoon_log', reminderTime: '15:00' },
  { type: 'night_review', reminderTime: '21:00' },
];
