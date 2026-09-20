const ROUTER_OWNED_HISTORY_KEYS = new Set(["__NA", "_N", "__N", "__PRIVATE_NEXTJS_INTERNALS_TREE"]);

/**
 * Pass only custom state into Next's native history adapter. Replaying its
 * private markers makes it mistake an app write for an internal router write,
 * so a later router commit can discard the shell/dialog state. The adapter adds
 * its current markers itself; always give it a fresh object because it mutates
 * the argument while doing so.
 */
export function customHistoryState(state: unknown): Record<string, unknown> {
  if (!state || typeof state !== "object" || Array.isArray(state)) return {};
  return Object.fromEntries(Object.entries(state).filter(([key]) => !ROUTER_OWNED_HISTORY_KEYS.has(key)));
}
