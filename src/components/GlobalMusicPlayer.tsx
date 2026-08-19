import { useEffect, useRef } from "react";
import { useSettingsStore } from "../store/useSettingsStore";
import { useAuth } from "../hooks/useAuth";
import { getDefaultRadioTracks, type RadioTrack } from "../config/publicAssets";

const TARGET_VOLUME = 0.35;
const CROSSFADE_DURATION_MS = 1500;
const TIMEUPDATE_FADE_THRESHOLD_SEC = 2.0;

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

export default function GlobalMusicPlayer({ musicList = [] }: { musicList?: any[] }) {
  const { musicEnabled, musicTrack, setMusicTrack } = useSettingsStore();
  const { user } = useAuth();

  // Combine store custom tracks with the 49 public Bananto Radio tracks
  const defaultTracks = useRef<RadioTrack[]>(getDefaultRadioTracks()).current;
  const activeCustomTracks = musicList.filter((m) => m.active && m.fileUrl);
  const allTracks: RadioTrack[] =
    activeCustomTracks.length > 0 ? activeCustomTracks : defaultTracks;

  // Dual audio elements for seamless streaming & crossfade
  const audioARef = useRef<HTMLAudioElement | null>(null);
  const audioBRef = useRef<HTMLAudioElement | null>(null);
  const activeSlotRef = useRef<"A" | "B">("A");

  // Playback state & Shuffle Bag
  const shuffleBagRef = useRef<RadioTrack[]>([]);
  const lastTrackIdRef = useRef<string | null>(null);
  const currentTrackRef = useRef<RadioTrack | null>(null);
  const isTransitioningRef = useRef(false);
  const userGesturePendingRef = useRef(false);

  // Initialize or replenish the Shuffle Bag
  const getNextTrack = (): RadioTrack | null => {
    if (allTracks.length === 0) return null;
    if (allTracks.length === 1) return allTracks[0]!;

    if (shuffleBagRef.current.length === 0) {
      const fresh = shuffleArray(allTracks);
      // Ensure the first song of the new bag isn't the same as the last song of previous bag
      if (lastTrackIdRef.current && fresh[0]?.id === lastTrackIdRef.current) {
        const swapIdx = fresh.length > 1 ? 1 : 0;
        [fresh[0], fresh[swapIdx]] = [fresh[swapIdx]!, fresh[0]!];
      }
      shuffleBagRef.current = fresh;
    }

    const next = shuffleBagRef.current.shift() || allTracks[0]!;
    lastTrackIdRef.current = next.id;
    return next;
  };

  // Helper to create & configure audio elements
  const getAudioElements = () => {
    if (typeof window === "undefined") return { a: null, b: null };

    if (!audioARef.current) {
      const a = new Audio();
      a.preload = "auto";
      a.volume = 0;
      audioARef.current = a;
    }
    if (!audioBRef.current) {
      const b = new Audio();
      b.preload = "auto";
      b.volume = 0;
      audioBRef.current = b;
    }

    return { a: audioARef.current, b: audioBRef.current };
  };

  // Smooth crossfade between outgoing and incoming audio
  const performCrossfade = (
    outgoing: HTMLAudioElement | null,
    incoming: HTMLAudioElement,
    onComplete?: () => void,
  ) => {
    isTransitioningRef.current = true;
    const startTime = performance.now();
    const startVolOut = outgoing ? outgoing.volume : 0;

    incoming.volume = 0;
    const playPromise = incoming.play();
    if (playPromise) {
      playPromise.catch(() => {
        userGesturePendingRef.current = true;
      });
    }

    const step = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(1, elapsed / CROSSFADE_DURATION_MS);

      incoming.volume = progress * TARGET_VOLUME;
      if (outgoing) {
        outgoing.volume = Math.max(0, startVolOut * (1 - progress));
      }

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        if (outgoing) {
          outgoing.pause();
          outgoing.currentTime = 0;
          outgoing.volume = 0;
        }
        incoming.volume = TARGET_VOLUME;
        isTransitioningRef.current = false;
        if (onComplete) onComplete();
      }
    };

    requestAnimationFrame(step);
  };

  // Switch to a new track
  const transitionToTrack = (track: RadioTrack) => {
    const { a, b } = getAudioElements();
    if (!a || !b) return;

    currentTrackRef.current = track;

    const isCurrentA = activeSlotRef.current === "A";
    const outgoing = isCurrentA ? a : b;
    const incoming = isCurrentA ? b : a;
    const nextSlot = isCurrentA ? "B" : "A";

    incoming.src = track.fileUrl;
    incoming.currentTime = 0;

    performCrossfade(outgoing, incoming, () => {
      activeSlotRef.current = nextSlot;
    });
  };

  // Stop playback immediately
  const stopAll = () => {
    const { a, b } = getAudioElements();
    if (a) {
      a.pause();
      a.currentTime = 0;
      a.volume = 0;
    }
    if (b) {
      b.pause();
      b.currentTime = 0;
      b.volume = 0;
    }
    currentTrackRef.current = null;
    isTransitioningRef.current = false;
  };

  // Start Radio playback
  const startPlayback = () => {
    if (!musicEnabled) return;

    let targetTrack: RadioTrack | null = null;
    if (musicTrack) {
      targetTrack = allTracks.find((t) => t.id === musicTrack) || null;
    }
    if (!targetTrack) {
      targetTrack = getNextTrack();
    }

    if (targetTrack) {
      transitionToTrack(targetTrack);
    }
  };

  // Timeupdate handler to trigger crossfade before track end
  useEffect(() => {
    const { a, b } = getAudioElements();
    if (!a || !b) return;

    const handleTimeUpdate = (e: Event) => {
      if (!musicEnabled || isTransitioningRef.current) return;
      const audio = e.target as HTMLAudioElement;

      // When near the end of track, initiate crossfade to the next track
      if (audio.duration && audio.duration - audio.currentTime <= TIMEUPDATE_FADE_THRESHOLD_SEC) {
        const next = getNextTrack();
        if (next) {
          transitionToTrack(next);
        }
      }
    };

    const handleEnded = () => {
      if (!musicEnabled || isTransitioningRef.current) return;
      const next = getNextTrack();
      if (next) {
        transitionToTrack(next);
      }
    };

    a.addEventListener("timeupdate", handleTimeUpdate);
    a.addEventListener("ended", handleEnded);
    b.addEventListener("timeupdate", handleTimeUpdate);
    b.addEventListener("ended", handleEnded);

    return () => {
      a.removeEventListener("timeupdate", handleTimeUpdate);
      a.removeEventListener("ended", handleEnded);
      b.removeEventListener("timeupdate", handleTimeUpdate);
      b.removeEventListener("ended", handleEnded);
    };
  }, [musicEnabled, allTracks]);

  // Handle play / stop when musicEnabled or musicTrack changes
  useEffect(() => {
    if (musicEnabled) {
      if (musicTrack && currentTrackRef.current?.id !== musicTrack) {
        const track = allTracks.find((t) => t.id === musicTrack);
        if (track) {
          transitionToTrack(track);
          return;
        }
      }
      if (!currentTrackRef.current) {
        startPlayback();
      }
    } else {
      stopAll();
    }
  }, [musicEnabled, musicTrack]);

  // Autoplay recovery on user gesture (iOS / Safari policy)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const unlockGesture = () => {
      if (userGesturePendingRef.current && musicEnabled) {
        userGesturePendingRef.current = false;
        const { a, b } = getAudioElements();
        const activeAudio = activeSlotRef.current === "A" ? a : b;
        if (activeAudio && activeAudio.src) {
          activeAudio.play().catch(() => {});
        } else {
          startPlayback();
        }
      }
    };

    window.addEventListener("pointerdown", unlockGesture, { passive: true });
    window.addEventListener("keydown", unlockGesture, { passive: true });
    window.addEventListener("touchstart", unlockGesture, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", unlockGesture);
      window.removeEventListener("keydown", unlockGesture);
      window.removeEventListener("touchstart", unlockGesture);
    };
  }, [musicEnabled]);

  // Sync user's track setting from profile if changed
  useEffect(() => {
    if (user?.settings?.musicTrack && user.settings.musicTrack !== musicTrack) {
      setMusicTrack(user.settings.musicTrack);
    }
  }, [user?.settings?.musicTrack]);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      stopAll();
    };
  }, []);

  return null;
}
