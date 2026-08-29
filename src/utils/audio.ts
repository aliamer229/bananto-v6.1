/**
 * Central synthesized UI sound engine for Nintendo Switch UI feel.
 * Uses Web Audio API oscillator synthesis so no external audio files are required.
 */

export type SoundEffect =
  | "hover"
  | "hover_s"
  | "select"
  | "klick"
  | "confirm"
  | "bumper_end"
  | "toggle_on"
  | "toggle_off"
  | "turn_on"
  | "turn_off"
  | "alert"
  | "error"
  | "loading"
  | "settings"
  | "success"
  | string;

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function preloadSound(_name: string): void {
  // Pre-warming / no-op for synthesized audio
}

export function playSound(sound: SoundEffect = "select", volume = 0.25): void {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  try {
    const isSoundMuted = window.localStorage.getItem("settings-storage");
    if (isSoundMuted) {
      const parsed = JSON.parse(isSoundMuted);
      if (parsed?.state?.soundEnabled === false) return;
    }
  } catch {
    // Ignore localStorage parse errors
  }

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    const baseVol = Math.max(0.01, Math.min(volume, 1.0));

    switch (sound) {
      case "hover":
      case "hover_s":
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.04);
        gain.gain.setValueAtTime(baseVol * 0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.start(now);
        osc.stop(now + 0.05);
        break;

      case "select":
      case "klick":
        osc.type = "triangle";
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.06);
        gain.gain.setValueAtTime(baseVol * 0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
        osc.start(now);
        osc.stop(now + 0.08);
        break;

      case "confirm":
      case "bumper_end":
      case "success":
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(660, now + 0.06);
        osc.frequency.setValueAtTime(880, now + 0.12);
        gain.gain.setValueAtTime(baseVol * 0.7, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.24);
        break;

      case "toggle_on":
      case "turn_on":
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(700, now + 0.08);
        gain.gain.setValueAtTime(baseVol * 0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        osc.start(now);
        osc.stop(now + 0.1);
        break;

      case "toggle_off":
      case "turn_off":
        osc.type = "sine";
        osc.frequency.setValueAtTime(700, now);
        osc.frequency.exponentialRampToValueAtTime(350, now + 0.08);
        gain.gain.setValueAtTime(baseVol * 0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        osc.start(now);
        osc.stop(now + 0.1);
        break;

      case "alert":
      case "error":
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(280, now);
        osc.frequency.setValueAtTime(220, now + 0.08);
        gain.gain.setValueAtTime(baseVol * 0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.22);
        break;

      default:
        osc.type = "sine";
        osc.frequency.setValueAtTime(600, now);
        gain.gain.setValueAtTime(baseVol * 0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.06);
        break;
    }
  } catch {
    // Gracefully handle audio errors
  }
}
