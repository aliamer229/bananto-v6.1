import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface SettingsState {
  soundEnabled: boolean;
  musicEnabled: boolean;
  liteMotion: boolean;
  musicTrack: string | null;
  setSoundEnabled: (enabled: boolean) => void;
  setMusicEnabled: (enabled: boolean) => void;
  setLiteMotion: (lite: boolean) => void;
  setMusicTrack: (track: string | null) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      soundEnabled: true,
      musicEnabled: true,
      liteMotion: false,
      musicTrack: null,
      setSoundEnabled: (enabled: boolean) => set({ soundEnabled: enabled }),
      setMusicEnabled: (enabled: boolean) => set({ musicEnabled: enabled }),
      setLiteMotion: (lite: boolean) => set({ liteMotion: lite }),
      setMusicTrack: (track: string | null) => set({ musicTrack: track }),
    }),
    {
      name: "settings-storage",
      storage: createJSONStorage(() => (typeof window !== "undefined" ? localStorage : (undefined as any))),
    }
  )
);
