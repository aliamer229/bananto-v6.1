import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UI_SOUND_MAP } from "@/config/publicAssets";
import { clearPreloadedSounds, playSound, preloadSound } from "./audio";

class FakeAudio {
  static created: FakeAudio[] = [];
  src: string;
  preload = "";
  volume = 1;
  currentTime = 10;
  load = vi.fn();
  play = vi.fn(() => Promise.resolve());

  constructor(src = "") {
    this.src = src;
    FakeAudio.created.push(this);
  }

  cloneNode() {
    return new FakeAudio(this.src);
  }
}

describe("R2 UI sounds", () => {
  beforeEach(() => {
    FakeAudio.created = [];
    clearPreloadedSounds();
    vi.stubGlobal("window", {
      Audio: FakeAudio,
      localStorage: { getItem: vi.fn(() => null) },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("preloads the exact case-sensitive Cloudflare object", () => {
    preloadSound("settings");
    expect(FakeAudio.created[0]?.src).toBe(UI_SOUND_MAP.settings);
    expect(FakeAudio.created[0]?.load).toHaveBeenCalledOnce();
  });

  it("clones the cached R2 sound so rapid interactions can overlap", () => {
    preloadSound("klick");
    playSound("klick", 0.6);
    playSound("klick", 0.4);

    expect(FakeAudio.created).toHaveLength(3);
    expect(FakeAudio.created[1]?.src).toBe("https://assets.banan.to/Audio/Ui/klick.webm");
    expect(FakeAudio.created[1]?.volume).toBe(0.6);
    expect(FakeAudio.created[1]?.currentTime).toBe(0);
    expect(FakeAudio.created[1]?.play).toHaveBeenCalledOnce();
    expect(FakeAudio.created[2]?.play).toHaveBeenCalledOnce();
  });

  it("honours the existing sound preference", () => {
    vi.mocked(window.localStorage.getItem).mockReturnValue(
      JSON.stringify({ state: { soundEnabled: false } }),
    );
    playSound("home");
    expect(FakeAudio.created).toHaveLength(0);
  });
});
