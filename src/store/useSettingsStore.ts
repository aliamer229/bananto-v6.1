import { create } from "zustand";
import { persist } from "zustand/middleware";
import { savePreferences } from "@/lib/settings.functions";

interface SettingsState {
  soundEnabled: boolean;
  musicEnabled: boolean;
  liteMotion: boolean;
  musicTrack: string | undefined;
  setSoundEnabled: (enabled: boolean, sync?: boolean) => void;
  setMusicEnabled: (enabled: boolean, sync?: boolean) => void;
  setLiteMotion: (enabled: boolean, sync?: boolean) => void;
  setMusicTrack: (id: string | undefined, sync?: boolean) => void;
  syncWithDB: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      soundEnabled: true,
      musicEnabled: true,
      liteMotion: false,
      musicTrack: undefined,

      setSoundEnabled: (enabled, sync = true) => {
        set({ soundEnabled: enabled });
        if (sync) get().syncWithDB();
      },
      setMusicEnabled: (enabled, sync = true) => {
        set({ musicEnabled: enabled });
        if (sync) get().syncWithDB();
      },
      setLiteMotion: (enabled, sync = true) => {
        set({ liteMotion: enabled });
        if (sync) get().syncWithDB();
      },
      setMusicTrack: (id, sync = true) => {
        set({ musicTrack: id });
        if (sync) get().syncWithDB();
      },

      syncWithDB: async () => {
        const state = get();
        const prefs = {
          soundEnabled: state.soundEnabled,
          musicEnabled: state.musicEnabled,
          liteMotion: state.liteMotion,
          musicTrack: state.musicTrack,
        };
        try {
          await savePreferences({ data: { prefs } });
        } catch (error) {
          // Silently fail if not logged in or network error
          console.debug("Failed to sync preferences with DB", error);
        }
      },
    }),
    {
      name: "nintendo-settings",
      // Only persist basic UI settings locally, the rest comes from DB if logged in
    },
  ),
);
