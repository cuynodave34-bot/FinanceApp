import { redactSensitiveText } from './redaction';

describe('redactSensitiveText', () => {
  it('redacts bearer tokens, API keys, passwords, and emails', () => {
    const result = redactSensitiveText(
      'Bearer abc.def_123 token=refresh-token password=hunter2 email test@example.com EXPO_PUBLIC_GROQ_API_KEY=gsk_live'
    );

    expect(result).toContain('Bearer [redacted]');
    expect(result).toContain('token=[redacted]');
    expect(result).toContain('password=[redacted]');
    expect(result).toContain('[redacted-email]');
    expect(result).toContain('EXPO_PUBLIC_GROQ_API_KEY=[redacted]');
    expect(result).not.toContain('abc.def_123');
    expect(result).not.toContain('hunter2');
    expect(result).not.toContain('test@example.com');
    expect(result).not.toContain('gsk_live');
  });

  it('truncates long messages', () => {
    const result = redactSensitiveText('x'.repeat(1000), 120);
    expect(result).toHaveLength(120);
  });
});
