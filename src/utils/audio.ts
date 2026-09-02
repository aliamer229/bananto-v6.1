/**
 * UI sound player backed by the canonical Cloudflare R2 library.
 *
 * The sound map is the source of truth for filenames and case. Keep playback
 * here intentionally small: UI sounds may overlap, so the preloaded element is
 * a template and each interaction gets its own clone.
 */

import { UI_SOUND_MAP } from "@/config/publicAssets";

export type SoundEffect = keyof typeof UI_SOUND_MAP | string;

type AudioLike = HTMLAudioElement;

const preloaded = new Map<string, AudioLike>();

function soundUrl(name: string): string | undefined {
  return UI_SOUND_MAP[name] || UI_SOUND_MAP[name.toLowerCase()];
}

function soundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = window.localStorage.getItem("settings-storage");
    if (!stored) return true;
    return JSON.parse(stored)?.state?.soundEnabled !== false;
  } catch {
    return true;
  }
}

function makeAudio(url: string): AudioLike | undefined {
  if (typeof window === "undefined" || typeof window.Audio !== "function") return undefined;
  const audio = new window.Audio(url);
  audio.preload = "auto";
  return audio;
}

function getTemplate(name: string): AudioLike | undefined {
  const url = soundUrl(name);
  if (!url) return undefined;
  const cached = preloaded.get(url);
  if (cached) return cached;

  const audio = makeAudio(url);
  if (!audio) return undefined;
  preloaded.set(url, audio);
  audio.load?.();
  return audio;
}

/** Preload one R2 object without starting playback. */
export function preloadSound(name: string): void {
  getTemplate(name);
}

/**
 * Play the exact file assigned in `UI_SOUND_MAP`.
 *
 * Browsers can reject playback before a user gesture; that is expected and is
 * swallowed so sound can never break the interaction that requested it.
 */
export function playSound(sound: SoundEffect = "select", volume = 0.25): void {
  if (!soundEnabled()) return;

  try {
    const template = getTemplate(String(sound));
    if (!template) return;
    const audio = template.cloneNode(true) as AudioLike;
    audio.preload = "auto";
    audio.volume = Math.max(0, Math.min(Number.isFinite(volume) ? volume : 0.25, 1));
    audio.currentTime = 0;
    const result = audio.play();
    if (result && typeof result.catch === "function") void result.catch(() => undefined);
  } catch {
    // Audio is optional. A missing codec/object or a browser policy must never
    // turn a button press into an application error.
  }
}

/** Test-only reset; deliberately not exported from the public barrel. */
export function clearPreloadedSounds(): void {
  preloaded.clear();
}
