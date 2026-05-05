import { ensurePriorityTwoDatabaseSchema, getDatabase } from '@/db/sqlite/client';
import { AlertSeverity, UserAlert } from '@/shared/types/domain';
import { createId } from '@/shared/utils/id';
import { nowIso } from '@/shared/utils/time';
import { normalizeRequiredTextInput } from '@/shared/validation/text';
import { buildSyncQueueItem } from '@/sync/queue/factory';
import { enqueueSyncItem } from '@/sync/queue/repository';

type UserAlertRow = {
  id: string;
  userId: string;
  alertType: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  isRead: number;
  metadata: string;
  createdAt: string;
  updatedAt: string;
};

type CreateUserAlertInput = {
  userId: string;
  alertType: string;
  title: string;
  message: string;
  severity?: AlertSeverity;
  metadata?: Record<string, unknown>;
};

function mapUserAlert(row: UserAlertRow): UserAlert {
  return {
    ...row,
    isRead: Boolean(row.isRead),
    metadata: parseMetadata(row.metadata),
  };
}

function parseMetadata(value: string) {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

const allowedSeverities: AlertSeverity[] = ['info', 'warning', 'danger'];

function normalizeSeverity(value: AlertSeverity | undefined) {
  const severity = value ?? 'info';
  if (!allowedSeverities.includes(severity)) {
    throw new Error('Invalid alert severity.');
  }

  return severity;
}

export async function listUserAlertsByUser(userId: string) {
  await ensurePriorityTwoDatabaseSchema();
  const database = getDatabase();
  const rows = await database.getAllAsync<UserAlertRow>(
    `select
      id,
      user_id as userId,
      alert_type as alertType,
      title,
      message,
      severity,
      is_read as isRead,
      metadata,
      created_at as createdAt,
      updated_at as updatedAt
    from user_alerts
    where user_id = ?
    order by is_read asc,
      case severity when 'danger' then 0 when 'warning' then 1 else 2 end,
      created_at desc`,
    [userId]
  );

  return rows.map(mapUserAlert);
}

export async function createUserAlert(input: CreateUserAlertInput) {
  await ensurePriorityTwoDatabaseSchema();
  const timestamp = nowIso();
  const alert: UserAlert = {
    id: createId(),
    userId: input.userId,
    alertType: normalizeRequiredTextInput(input.alertType, { fieldName: 'Alert type', maxLength: 80 }),
    title: normalizeRequiredTextInput(input.title, { fieldName: 'Alert title', maxLength: 120 }),
    message: normalizeRequiredTextInput(input.message, { fieldName: 'Alert message', maxLength: 1000 }),
    severity: normalizeSeverity(input.severity),
    isRead: false,
    metadata: input.metadata ?? {},
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const database = getDatabase();
  await database.runAsync(
    `insert into user_alerts (
      id,
      user_id,
      alert_type,
      title,
      message,
      severity,
      is_read,
      metadata,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      alert.id,
      alert.userId,
      alert.alertType,
      alert.title,
      alert.message,
      alert.severity,
      0,
      JSON.stringify(alert.metadata),
      alert.createdAt,
      alert.updatedAt,
    ]
  );

  await enqueueSyncItem(
    buildSyncQueueItem(alert.userId, 'user_alerts', alert.id, 'create', alert)
  );

  return alert;
}

export async function markUserAlertRead(userId: string, id: string) {
  await ensurePriorityTwoDatabaseSchema();
  const updatedAt = nowIso();
  const database = getDatabase();

  await database.runAsync(
    `update user_alerts
     set is_read = 1,
         updated_at = ?
     where id = ? and user_id = ?`,
    [updatedAt, id, userId]
  );

  await enqueueSyncItem(
    buildSyncQueueItem(userId, 'user_alerts', id, 'update', {
      id,
      userId,
      isRead: true,
      updatedAt,
    })
  );
}
