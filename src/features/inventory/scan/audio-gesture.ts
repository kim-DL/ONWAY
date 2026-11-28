const muteKey = "onnuriway.inventory-scan.muted";

export function readScanMuted() {
  try { return localStorage.getItem(muteKey) === "1"; } catch { return false; }
}
export function writeScanMuted(muted: boolean) {
  try { localStorage.setItem(muteKey, muted ? "1" : "0"); } catch { /* Keep the in-session choice. */ }
}
export function activateScanAudio(existing?: AudioContext | null) {
  try {
    const Audio = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Audio) return null;
    const audio = existing && existing.state !== "closed" ? existing : new Audio();
    if (audio.state !== "running") void audio.resume().catch(() => {});
    return audio;
  } catch { return null; }
}

// Keep the user's tap across the lazy import and camera permission prompt.
let primed: AudioContext | null = null;
let expiry: number | undefined;
export function primeScanSound() {
  if (readScanMuted()) return;
  primed = activateScanAudio(primed);
  window.clearTimeout(expiry);
  expiry = window.setTimeout(() => { const audio = takeScanAudio(); void audio?.close().catch(() => {}); }, 15000);
}
export function takeScanAudio() {
  window.clearTimeout(expiry);
  const audio = primed;
  primed = null;
  return audio;
}
