import { isWorkMode, normalizeView, type ShellView, type WorkMode } from "./shell-policy";

export function shellResumeKey(uid: string, sessionVersion: number, permissionsVersion: number) {
  return `onnuriway:private:v1:shell-resume:${uid}:${sessionVersion}:${permissionsVersion}`;
}

/** Store navigation only. No school/customer records, photos, or form drafts. */
export function readShellResume(key: string, availableModes: readonly WorkMode[]) {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!saved || typeof saved !== "object") return null;
    const { mode, view } = saved as { mode?: unknown; view?: unknown };
    if (!isWorkMode(mode) || !availableModes.includes(mode)) return null;
    if (view !== "schools" && view !== "activity" && view !== "settings") return null;
    return { mode, view: normalizeView(mode, view) };
  } catch {
    return null;
  }
}

export function writeShellResume(key: string, mode: WorkMode, view: ShellView) {
  try {
    localStorage.setItem(key, JSON.stringify({ mode, view: normalizeView(mode, view) }));
  } catch {
    // Navigation still works when device storage is unavailable.
  }
}
