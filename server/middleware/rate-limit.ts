export interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyPrefix?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
}

const globalForRL = globalThis as unknown as {
  sieveRateLimitBuckets?: Map<string, { count: number; resetAt: number }>;
};
const requestBuckets =
  globalForRL.sieveRateLimitBuckets ??
  (globalForRL.sieveRateLimitBuckets = new Map<string, { count: number; resetAt: number }>());

/**
 * In-memory sliding window rate limiter per key (IP or wallet).
 */
export function checkRateLimit(
  key: string,
  options: RateLimitOptions = { windowMs: 60_000, max: 60 }
): RateLimitResult {
  const now = Date.now();
  for (const [id, value] of requestBuckets) if (value.resetAt <= now) requestBuckets.delete(id);
  const fullKey = `${options.keyPrefix ?? "rl"}:${key}`;
  const bucket = requestBuckets.get(fullKey);
  if (!bucket && requestBuckets.size >= 10000) {
    return { allowed: false, limit: options.max, remaining: 0, resetMs: options.windowMs };
  }

  if (!bucket || now >= bucket.resetAt) {
    requestBuckets.set(fullKey, {
      count: 1,
      resetAt: now + options.windowMs,
    });
    return {
      allowed: true,
      limit: options.max,
      remaining: options.max - 1,
      resetMs: options.windowMs,
    };
  }

  if (bucket.count >= options.max) {
    return {
      allowed: false,
      limit: options.max,
      remaining: 0,
      resetMs: Math.max(0, bucket.resetAt - now),
    };
  }

  bucket.count += 1;
  return {
    allowed: true,
    limit: options.max,
    remaining: options.max - bucket.count,
    resetMs: Math.max(0, bucket.resetAt - now),
  };
}

/**
 * Derives a composite client identity key for rate limiting:
 * composite key = trusted client IP + wallet (where wallet is supplementary, never the sole identity).
 * 
 * IMPORTANT: This in-memory limiter is per-process and is therefore NOT a globally
 * shared production rate limit across distributed/serverless infrastructure.
 */
export function getClientIdentifier(request: Request, wallet?: string | null): string {
  // Set only when ingress overwrites this header and direct origin access is blocked.
  const header = process.env.TRUSTED_CLIENT_IP_HEADER;
  const value = header ? request.headers.get(header)?.trim() : null;
  return value && value.length <= 64 && /^[0-9a-fA-F:.]+$/.test(value) ? `ip:${value}` : "anonymous";
}

export function clearRateLimitBuckets(): void {
  requestBuckets.clear();
}
