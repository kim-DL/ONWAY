const KEY = "onnuriway:inventory-count-mode";
type Preference = { sessionKey: string; date: string; enabled: boolean };
type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

/** Personal UI preference only; never an authorization grant or a queued count. */
export function readInventoryCountPreference(storage: PreferenceStorage | undefined, sessionKey: string, date: string): boolean {
  try {
    const value: unknown = JSON.parse(storage?.getItem(KEY) ?? "null");
    if (!value || typeof value !== "object") return false;
    const preference = value as Partial<Preference>;
    return preference.sessionKey === sessionKey && preference.date === date && preference.enabled === true;
  } catch { return false; }
}
export function writeInventoryCountPreference(storage: PreferenceStorage | undefined, sessionKey: string, date: string, enabled: boolean): void {
  try { storage?.setItem(KEY, JSON.stringify({ sessionKey, date, enabled } satisfies Preference)); } catch { /* Memory state still works when storage is unavailable. */ }
}
