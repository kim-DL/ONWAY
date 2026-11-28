import { activateScanAudio, takeScanAudio } from "./audio-gesture";

/** Audio is optional on devices that require the first tap to unlock playback. */
export class ScanFeedback {
  private audio: AudioContext | null = null;
  private opened = false;
  private lastTick = -Infinity;
  private captureEnd = 0;
  private lastPulse = -Infinity;

  unlock() {
    this.audio = activateScanAudio(this.audio ?? takeScanAudio());
  }

  private tone(startHz: number, endHz: number, offset: number, duration: number) {
    const audio = this.audio;
    if (!audio || audio.state === "closed" || document.hidden) return;
    try {
      const start = audio.currentTime + offset;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(startHz, start);
      oscillator.frequency.exponentialRampToValueAtTime(endHz, start + duration);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.14, start + 0.008);
      gain.gain.setValueAtTime(0.14, start + duration * 0.52);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(start);
      oscillator.stop(start + duration);
      return start + duration;
    } catch { /* A device audio interruption must not discard a successful capture. */ }
  }

  ready() {
    if (this.opened || !this.audio) return;
    this.opened = true;
    this.preview();
  }
  preview() { this.tone(560, 720, 0, 0.09); }

  pulse(strength: number, holding = false) {
    if (!this.audio || (!holding && strength < 0.12)) return;
    const now = performance.now();
    const spacing = holding ? 178 - strength * 95 : 800 - strength * 450;
    if (now - this.lastPulse < spacing) return;
    this.lastPulse = now;
    const hz = holding ? 850 + 380 * strength : 480 + 300 * strength;
    this.tone(hz, hz, 0, holding ? 0.047 : 0.055);
  }

  settled() {
    if (!this.audio || performance.now() - this.lastTick < 2200) return;
    this.lastTick = performance.now();
    this.tone(660, 660, 0, 0.055);
    this.tone(760, 760, 0.085, 0.055);
    this.tone(860, 860, 0.17, 0.06);
  }

  captured() {
    this.tone(720, 780, 0, 0.08);
    this.tone(920, 960, 0.055, 0.09);
    this.captureEnd = this.tone(1140, 1320, 0.115, 0.14) ?? 0;
  }

  /** Allow the accepted-frame cue to finish across the transition to review. */
  finishCapture() {
    const audio = this.audio;
    if (!audio || !this.captureEnd || audio.currentTime >= this.captureEnd || document.hidden) return;
    this.audio = null;
    const close = () => {
      clearTimeout(timer);
      audio.removeEventListener("statechange", finish);
      document.removeEventListener("visibilitychange", close);
      window.removeEventListener("pagehide", close);
      void audio.close().catch(() => {});
    };
    const end = this.captureEnd;
    let timer = window.setTimeout(close, 1800);
    function finish() {
      if (audio?.state !== "running") return;
      window.clearTimeout(timer);
      timer = window.setTimeout(close, Math.max(0, end - audio.currentTime) * 1000 + 100);
    }
    audio.addEventListener("statechange", finish);
    finish();
    document.addEventListener("visibilitychange", close, { once: true });
    window.addEventListener("pagehide", close, { once: true });
  }

  release() {
    const audio = this.audio;
    this.audio = null;
    this.captureEnd = 0;
    this.opened = false;
    this.lastTick = -Infinity;
    if (audio && audio.state !== "closed") void audio.close().catch(() => {});
  }
}
