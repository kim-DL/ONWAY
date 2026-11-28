const muteKey = "onnuriway.inventory-scan.muted";

export function readScanMuted(): boolean {
  try { return localStorage.getItem(muteKey) === "1"; } catch { return false; }
}

export function writeScanMuted(value: boolean) {
  try { localStorage.setItem(muteKey, value ? "1" : "0"); } catch { /* Session control works with storage off. */ }
}

/** Audio is optional on devices that require the first tap to unlock playback. */
export class ScanFeedback {
  private audio: AudioContext | null = null;
  private ticks = 0;
  private lastTick = -Infinity;
  private captureEnd = 0;

  unlock() {
    try {
      const Audio = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Audio) return;
      this.audio ??= new Audio();
      if (this.audio.state === "suspended") void this.audio.resume().catch(() => {});
    } catch { /* Silent controls and viewfinder remain usable. */ }
  }

  private tone(startHz: number, endHz: number, offset: number, duration: number) {
    const audio = this.audio;
    if (!audio || audio.state !== "running" || document.hidden) return;
    try {
      const start = audio.currentTime + offset;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(startHz, start);
      oscillator.frequency.exponentialRampToValueAtTime(endHz, start + duration);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.045, start + 0.007);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(start);
      oscillator.stop(start + duration);
      return start + duration;
    } catch { /* A device audio interruption must not discard a successful capture. */ }
  }

  settled() {
    if (this.audio?.state !== "running" || this.ticks >= 3 || performance.now() - this.lastTick < 3000) return;
    this.ticks += 1;
    this.lastTick = performance.now();
    this.tone(680, 680, 0, 0.034);
    this.tone(680, 680, 0.075, 0.034);
  }

  captured() {
    this.captureEnd = this.tone(620, 1020, 0, 0.13) ?? 0;
  }

  /** A fast barcode match can close the sheet before the 130 ms shutter cue ends. */
  finishCapture() {
    const audio = this.audio;
    if (!audio || audio.state !== "running" || audio.currentTime >= this.captureEnd || document.hidden) return;
    this.audio = null;
    const close = () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", close);
      window.removeEventListener("pagehide", close);
      void audio.close().catch(() => {});
    };
    const timer = window.setTimeout(close, Math.min(140, Math.ceil((this.captureEnd - audio.currentTime) * 1000) + 5));
    document.addEventListener("visibilitychange", close, { once: true });
    window.addEventListener("pagehide", close, { once: true });
  }

  release() {
    const audio = this.audio;
    this.audio = null;
    this.captureEnd = 0;
    if (audio && audio.state !== "closed") void audio.close().catch(() => {});
  }
}
