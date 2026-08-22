/**
 * Tiny UI sound layer.
 *
 * Sounds are synthesised with the Web Audio API rather than shipped as assets,
 * so they cost nothing to load. Everything is opt-in: muted by default until
 * the user enables it, and silenced entirely when the OS asks for reduced
 * motion/effects.
 */

import { playSound as playCentralSound } from "@/utils/audio";

export type SoundName = "hover" | "select" | "confirm" | "toggle_on" | "toggle_off" | "alert";

const SOUND_NAME_BRIDGE: Record<SoundName, string> = {
  hover: "hover_s",
  select: "klick",
  confirm: "bumper_end",
  toggle_on: "turn_on",
  toggle_off: "turn_off",
  alert: "error",
};

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

export function playSound(name: SoundName): void {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const mappedName = SOUND_NAME_BRIDGE[name] || name;
  playCentralSound(mappedName as any, 0.6);
}
