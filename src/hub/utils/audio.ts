/**
 * Tiny UI sound layer.
 *
 * Sounds are synthesised with the Web Audio API rather than shipped as assets,
 * so they cost nothing to load. Everything is opt-in: muted by default until
 * the user enables it, and silenced entirely when the OS asks for reduced
 * motion/effects.
 */

import { getAudioContext } from "@/utils/audio";

export type SoundName = "hover" | "select" | "confirm" | "toggle_on" | "toggle_off" | "alert";

const STORAGE_KEY = "banam:sound-enabled";

let enabled = readPreference();

function readPreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function isSoundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(next: boolean): void {
  enabled = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    /* storage unavailable — preference stays in memory for this session */
  }
}

const TONES: Record<
  SoundName,
  { freq: number; to?: number; duration: number; gain: number; type: OscillatorType }
> = {
  hover: { freq: 620, duration: 0.045, gain: 0.015, type: "sine" },
  select: { freq: 720, to: 880, duration: 0.08, gain: 0.03, type: "sine" },
  confirm: { freq: 660, to: 990, duration: 0.16, gain: 0.04, type: "triangle" },
  toggle_on: { freq: 520, to: 780, duration: 0.12, gain: 0.035, type: "sine" },
  toggle_off: { freq: 640, to: 420, duration: 0.12, gain: 0.03, type: "sine" },
  alert: { freq: 880, to: 1180, duration: 0.18, gain: 0.045, type: "triangle" },
};

export function playSound(name: SoundName): void {
  if (!enabled || typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const spec = TONES[name];
  if (!spec) return;

  try {
    const context = getAudioContext();
    if (!context) return;
    if (context.state === "suspended") void context.resume();

    const now = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();

    osc.type = spec.type;
    osc.frequency.setValueAtTime(spec.freq, now);
    if (spec.to) osc.frequency.exponentialRampToValueAtTime(spec.to, now + spec.duration);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(spec.gain, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + spec.duration);

    osc.connect(gain).connect(context.destination);
    osc.start(now);
    osc.stop(now + spec.duration + 0.02);
  } catch {
    /* audio is decorative — never let it break an interaction */
  }
}
