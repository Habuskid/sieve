/**
 * Lightweight sliding window rate limiter for Sieve API endpoints.
 * Operates in-memory; suitable for single-instance or serverless container runtimes.
 */

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const ipLimitStore = new Map<string, RateLimitRecord>();

// Clean up stale entries every 60 seconds
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of ipLimitStore.entries()) {
      if (now > record.resetAt) {
        ipLimitStore.delete(ip);
      }
    }
  }, 60_000);
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(
  key: string,
  config: RateLimitConfig = { windowMs: 60_000, maxRequests: 60 }
): RateLimitResult {
  const now = Date.now();
  const existing = ipLimitStore.get(key);

  if (!existing || now > existing.resetAt) {
    const record: RateLimitRecord = {
      count: 1,
      resetAt: now + config.windowMs,
    };
    ipLimitStore.set(key, record);
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: record.resetAt,
    };
  }

  if (existing.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: config.maxRequests - existing.count,
    resetAt: existing.resetAt,
  };
}
