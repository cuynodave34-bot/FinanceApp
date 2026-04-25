export function nowIso() {
  return new Date().toISOString();
}

function pad(value: number) {
  return value.toString().padStart(2, '0');
}

export function toDateKey(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid date value.');
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function toTimeKey(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid time value.');
  }

  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function isTimeKey(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function combineDateAndTime(dateKey: string, timeKey: string) {
  if (!isDateKey(dateKey) || !isTimeKey(timeKey)) {
    throw new Error('Invalid date or time input.');
  }

  const [year, month, day] = dateKey.split('-').map(Number);
  const [hours, minutes] = timeKey.split(':').map(Number);

  return new Date(year, month - 1, day, hours, minutes, 0, 0).toISOString();
}

export function splitIsoToDateAndTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid date value.');
  }

  return {
    date: toDateKey(date),
    time: toTimeKey(date),
  };
}

export function dateKeyToDate(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function timeKeyToDate(timeKey: string) {
  const [hours, minutes] = timeKey.split(':').map(Number);
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
}

export function addDays(dateKey: string, amount: number) {
  const date = new Date(`${dateKey}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid date key.');
  }

  date.setDate(date.getDate() + amount);
  return toDateKey(date);
}

export function listDateKeysBetween(startDateKey: string, endDateKey: string) {
  if (startDateKey > endDateKey) {
    return [];
  }

  const keys: string[] = [];
  let current = startDateKey;

  while (current <= endDateKey) {
    keys.push(current);
    current = addDays(current, 1);
  }

  return keys;
}
