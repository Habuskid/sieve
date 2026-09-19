export const DEFAULT_REFERENCE_MAX_AGE_MS = 60_000; // 60 seconds
export const DEFAULT_QUOTE_MAX_AGE_MS = 30_000; // 30 seconds
export const DEFAULT_CHECK_EXPIRY_MS = 45_000; // 45 seconds

/**
 * Validates whether a timestamp is fresh relative to `now`.
 */
export function isFresh(
  observedAt: string | number | Date,
  now: number | Date = Date.now(),
  maxAgeMs: number = DEFAULT_QUOTE_MAX_AGE_MS
): boolean {
  const observedTime = typeof observedAt === "number"
    ? observedAt
    : new Date(observedAt).getTime();
  const currentTime = typeof now === "number" ? now : new Date(now).getTime();

  if (isNaN(observedTime) || isNaN(currentTime)) {
    return false;
  }

  const age = currentTime - observedTime;
  // Age must be non-negative (within reasonable clock skew of 5s) and <= maxAgeMs
  return age >= -5000 && age <= maxAgeMs;
}

/**
 * Checks if a specific expiration timestamp has passed.
 */
export function isExpired(
  expiresAt: string | number | Date | null | undefined,
  now: number | Date = Date.now()
): boolean {
  if (!expiresAt) return false;
  const expiryTime = typeof expiresAt === "number"
    ? expiresAt
    : new Date(expiresAt).getTime();
  const currentTime = typeof now === "number" ? now : new Date(now).getTime();
  if (isNaN(expiryTime) || isNaN(currentTime)) return true;
  return currentTime >= expiryTime;
}
