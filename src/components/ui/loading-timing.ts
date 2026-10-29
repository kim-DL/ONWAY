/** A loading operation owns its start time, including across fallback remounts. */
export const LOADING_INDICATOR_DELAY = 1_000;
export const LOADING_DETAIL_DELAY = 3_000;

export function getLoadingStage(startedAt: number, now = Date.now()): 0 | 1 | 2 {
  const elapsed = Math.max(0, now - startedAt);
  return elapsed >= LOADING_DETAIL_DELAY ? 2 : elapsed >= LOADING_INDICATOR_DELAY ? 1 : 0;
}

/** Only two boundary timers; stopping an operation never waits for either one. */
export function subscribeToLoadingStage(startedAt: number, notify: () => void): () => void {
  const timers = [LOADING_INDICATOR_DELAY, LOADING_DETAIL_DELAY]
    .map((delay) => startedAt + delay - Date.now())
    .filter((remaining) => remaining > 0)
    .map((remaining) => setTimeout(notify, remaining));
  return () => timers.forEach(clearTimeout);
}
