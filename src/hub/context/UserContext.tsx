import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CurrencyCode } from "@/hub/types";

/**
 * Signed-in user state: wishlist, price alerts, follow preferences and the
 * activity signals that feed personalised recommendations.
 *
 * Persistence is localStorage in this build. Every mutation goes through this
 * context, so swapping in an authenticated API is a change to `persist()` and
 * the initial load — not to any component.
 */

export interface PriceAlert {
  slug: string;
  targetAmount: number;
  currency: CurrencyCode;
  createdAt: string;
}

export interface FollowPrefs {
  priceDrop: boolean;
  newDlc: boolean;
  newEdition: boolean;
  release: boolean;
  majorUpdate: boolean;
  newGuide: boolean;
  community: boolean;
}

export const DEFAULT_FOLLOW_PREFS: FollowPrefs = {
  priceDrop: true,
  newDlc: true,
  newEdition: false,
  release: true,
  majorUpdate: false,
  newGuide: false,
  community: false,
};

interface UserState {
  wishlist: string[];
  alerts: PriceAlert[];
  follows: Record<string, FollowPrefs>;
  viewed: string[];
  purchased: string[];
  searches: string[];
}

const EMPTY: UserState = {
  wishlist: [],
  alerts: [],
  follows: {},
  viewed: [],
  purchased: [],
  searches: [],
};

const STORAGE_KEY = "banam:user";

interface UserValue extends UserState {
  isWishlisted: (slug: string) => boolean;
  toggleWishlist: (slug: string) => boolean;
  getAlert: (slug: string) => PriceAlert | undefined;
  setAlert: (alert: PriceAlert) => void;
  removeAlert: (slug: string) => void;
  getFollowPrefs: (slug: string) => FollowPrefs | undefined;
  setFollowPrefs: (slug: string, prefs: FollowPrefs) => void;
  recordView: (slug: string) => void;
  recordSearch: (term: string) => void;
}

const UserContext = createContext<UserValue | null>(null);

function load(): UserState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<UserState>) };
  } catch {
    return EMPTY;
  }
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UserState>(load);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* quota or private mode — state stays in memory */
    }
  }, [state]);

  const toggleWishlist = useCallback((slug: string) => {
    let added = false;
    setState((current) => {
      added = !current.wishlist.includes(slug);
      return {
        ...current,
        wishlist: added ? [slug, ...current.wishlist] : current.wishlist.filter((s) => s !== slug),
        // Wishlisting a game opts it into the default notification set.
        follows: added
          ? { ...current.follows, [slug]: current.follows[slug] ?? DEFAULT_FOLLOW_PREFS }
          : current.follows,
      };
    });
    return added;
  }, []);

  const setAlert = useCallback((alert: PriceAlert) => {
    setState((current) => ({
      ...current,
      alerts: [alert, ...current.alerts.filter((a) => a.slug !== alert.slug)],
    }));
  }, []);

  const removeAlert = useCallback((slug: string) => {
    setState((current) => ({ ...current, alerts: current.alerts.filter((a) => a.slug !== slug) }));
  }, []);

  const setFollowPrefs = useCallback((slug: string, prefs: FollowPrefs) => {
    setState((current) => ({ ...current, follows: { ...current.follows, [slug]: prefs } }));
  }, []);

  const recordView = useCallback((slug: string) => {
    setState((current) =>
      current.viewed[0] === slug
        ? current
        : { ...current, viewed: [slug, ...current.viewed.filter((s) => s !== slug)].slice(0, 40) },
    );
  }, []);

  const recordSearch = useCallback((term: string) => {
    const trimmed = term.trim();
    if (trimmed.length < 2) return;
    setState((current) => ({
      ...current,
      searches: [trimmed, ...current.searches.filter((s) => s !== trimmed)].slice(0, 20),
    }));
  }, []);

  const value = useMemo<UserValue>(
    () => ({
      ...state,
      isWishlisted: (slug) => state.wishlist.includes(slug),
      toggleWishlist,
      getAlert: (slug) => state.alerts.find((a) => a.slug === slug),
      setAlert,
      removeAlert,
      getFollowPrefs: (slug) => state.follows[slug],
      setFollowPrefs,
      recordView,
      recordSearch,
    }),
    [state, toggleWishlist, setAlert, removeAlert, setFollowPrefs, recordView, recordSearch],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser(): UserValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within <UserProvider>");
  return ctx;
}
