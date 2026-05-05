type NormalizeTextOptions = {
  fieldName?: string;
  required?: boolean;
  maxLength?: number;
};

export function normalizeTextInput(
  value: string | null | undefined,
  {
    fieldName = 'Text',
    required = false,
    maxLength = 255,
  }: NormalizeTextOptions = {}
) {
  const text = value?.trim() ?? '';

  if (required && !text) {
    throw new Error(`${fieldName} is required.`);
  }

  if (text.length > maxLength) {
    throw new Error(`${fieldName} must be ${maxLength} characters or fewer.`);
  }

  return text || null;
}

export function normalizeRequiredTextInput(
  value: string | null | undefined,
  options: Omit<NormalizeTextOptions, 'required'> = {}
) {
  return normalizeTextInput(value, { ...options, required: true })!;
}

export function sanitizeCsvCell(value: string) {
  if (/^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }

  return value;
}

