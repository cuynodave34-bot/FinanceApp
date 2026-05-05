const REDACTION_PATTERNS: Array<[RegExp, string]> = [
  [/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]'],
  [/(api[_-]?key|token|password|secret)["'\s:=]+[^"',\s]+/gi, '$1=[redacted]'],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]'],
  [/(EXPO_PUBLIC_[A-Z0-9_]*KEY=)[^\s]+/gi, '$1[redacted]'],
  [/(SUPABASE_[A-Z0-9_]*=)[^\s]+/gi, '$1[redacted]'],
  [/(GROQ_[A-Z0-9_]*=)[^\s]+/gi, '$1[redacted]'],
];

export function redactSensitiveText(value: unknown, maxLength = 500) {
  const message =
    value instanceof Error
      ? value.message
      : typeof value === 'object' && value !== null
        ? JSON.stringify(value)
        : String(value);

  return REDACTION_PATTERNS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    message
  ).slice(0, maxLength);
}
