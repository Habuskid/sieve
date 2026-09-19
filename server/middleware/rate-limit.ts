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
  const fullKey = `${options.keyPrefix ?? "rl"}:${key}`;
  const bucket = requestBuckets.get(fullKey);

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

export function getClientIdentifier(request: Request, wallet?: string | null): string {
  if (wallet) return `wallet:${wallet}`;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return `ip:${forwarded.split(",")[0].trim()}`;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return `ip:${realIp.trim()}`;
  return "ip:anonymous";
}

export function clearRateLimitBuckets(): void {
  requestBuckets.clear();
}
