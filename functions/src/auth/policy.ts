export const SOURCE_WINDOW_MS = 10 * 60 * 1_000;
export const SOURCE_ATTEMPT_LIMIT = 30;
export const SOURCE_LOCK_MS = 60 * 60 * 1_000;

export const LOOKUP_FAILURE_LIMIT = 5;
export const INITIAL_LOOKUP_LOCK_MS = 15 * 60 * 1_000;
export const MAX_LOOKUP_LOCK_MS = 24 * 60 * 60 * 1_000;

export function lookupLockDuration(lockCount: number) {
  const exponent = Math.max(0, Math.min(lockCount - 1, 10));
  return Math.min(INITIAL_LOOKUP_LOCK_MS * 2 ** exponent, MAX_LOOKUP_LOCK_MS);
}
