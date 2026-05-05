export function normalizeIsoDateTimeInput(
  value: string | null | undefined,
  fallback: string,
  fieldName = 'Date'
) {
  const normalized = value?.trim() || fallback;
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} is invalid.`);
  }

  return normalized;
}

export function assertDateLikeInput(value: string, fieldName = 'Date') {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} is invalid.`);
  }
}

