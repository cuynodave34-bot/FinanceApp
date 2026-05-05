import AsyncStorage from '@react-native-async-storage/async-storage';

type RateLimitOptions = {
  maxAttempts: number;
  windowMs: number;
  cooldownMs?: number;
};

type RateLimitState = {
  attempts: number[];
  blockedUntil?: number;
};

export class RateLimitError extends Error {
  retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super(`Too many attempts. Try again in ${Math.ceil(retryAfterMs / 1000)} seconds.`);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

function buildKey(key: string) {
  return `student-finance:rate-limit:${key}`;
}

function parseState(value: string | null): RateLimitState {
  if (!value) return { attempts: [] };

  try {
    const parsed = JSON.parse(value) as RateLimitState;
    return {
      attempts: Array.isArray(parsed.attempts) ? parsed.attempts.filter(Number.isFinite) : [],
      blockedUntil: Number.isFinite(parsed.blockedUntil) ? parsed.blockedUntil : undefined,
    };
  } catch {
    return { attempts: [] };
  }
}

export async function checkClientRateLimit(key: string, options: RateLimitOptions) {
  const now = Date.now();
  const storageKey = buildKey(key);
  const state = parseState(await AsyncStorage.getItem(storageKey));

  if (state.blockedUntil && state.blockedUntil > now) {
    throw new RateLimitError(state.blockedUntil - now);
  }

  const attempts = state.attempts.filter((timestamp) => now - timestamp < options.windowMs);

  if (attempts.length >= options.maxAttempts) {
    const blockedUntil = now + (options.cooldownMs ?? options.windowMs);
    await AsyncStorage.setItem(storageKey, JSON.stringify({ attempts, blockedUntil }));
    throw new RateLimitError(blockedUntil - now);
  }

  attempts.push(now);
  await AsyncStorage.setItem(storageKey, JSON.stringify({ attempts }));
}

export async function clearClientRateLimit(key: string) {
  await AsyncStorage.removeItem(buildKey(key));
}

