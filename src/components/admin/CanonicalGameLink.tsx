import { useEffect, useRef, useState } from "react";
import { Link2, Loader2, Search, X, CheckCircle2 } from "lucide-react";

export interface CanonicalGamePricing {
  game_id: string;
  title: string;
  trade_value_iqd: number;
  store_offer_bonus_iqd: number;
  trade_enabled: boolean;
  trade_value_locked: boolean;
  switch_version?: string | null;
  edition?: string | null;
}

interface CatalogRow {
  game_id: string;
  title: string;
  canonical_name?: string | null;
  trade_value_iqd?: number | null;
  store_offer_bonus_iqd?: number | null;
  trade_enabled?: number | boolean | null;
  trade_value_locked?: number | boolean | null;
  switch_version?: string | null;
  edition?: string | null;
}

function toPricing(row: CatalogRow): CanonicalGamePricing {
  return {
    game_id: row.game_id,
    title: row.canonical_name || row.title,
    trade_value_iqd: Number(row.trade_value_iqd || 0),
    store_offer_bonus_iqd: Number(row.store_offer_bonus_iqd || 0),
    trade_enabled:
      row.trade_enabled === undefined || row.trade_enabled === null
        ? true
        : Boolean(Number(row.trade_enabled)),
    trade_value_locked: Boolean(Number(row.trade_value_locked || 0)),
    switch_version: row.switch_version ?? null,
    edition: row.edition ?? null,
  };
}

/**
 * Searchable link between a store product and the canonical `game_catalog`
 * record. Matching is deterministic (title search against the catalog) — no AI.
 */
export default function CanonicalGameLink({
  gameId,
  defaultQuery = "",
  onLink,
  onUnlink,
}: {
  gameId?: string;
  defaultQuery?: string;
  onLink: (game: CanonicalGamePricing) => void;
  onUnlink: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [linked, setLinked] = useState<CanonicalGamePricing | null>(null);
  const loadedFor = useRef<string | undefined>(undefined);

  // Load the currently linked canonical record (and its live pricing).
  useEffect(() => {
    if (!gameId || loadedFor.current === gameId) return;
    loadedFor.current = gameId;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/game-catalog?mode=game&game_id=${encodeURIComponent(gameId)}`,
        );
        const data = (await res.json()) as { game?: CatalogRow };
        if (!cancelled && data.game) {
          const pricing = toPricing(data.game);
          setLinked(pricing);
          onLink(pricing);
        }
      } catch {
        /* offline: keep the manual values already in the form */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId, onLink]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/game-catalog?mode=search&q=${encodeURIComponent(term)}&limit=10`,
        );
        const data = (await res.json()) as { items?: CatalogRow[] };
        // Entries without a trade value are noise in the picker — hide them.
        if (!cancelled)
          setResults(
            (data.items ?? []).filter(
              (row) =>
                Number(row.trade_value_iqd || 0) + Number((row as any).store_offer_bonus_iqd || 0) >
                0,
            ),
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const select = (row: CatalogRow) => {
    const pricing = toPricing(row);
    loadedFor.current = pricing.game_id;
    setLinked(pricing);
    setOpen(false);
    setQuery("");
    onLink(pricing);
  };

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5 text-primary" />
          ربط اللعبة بالفهرس الرسمي (Canonical Game)
        </span>
        {linked && (
          <button
            type="button"
            onClick={() => {
              loadedFor.current = undefined;
              setLinked(null);
              onUnlink();
            }}
            className="text-[11px] text-red-500 hover:underline flex items-center gap-1"
          >
            <X className="w-3 h-3" /> إلغاء الربط
          </button>
        )}
      </div>

      {linked ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          <span className="font-bold text-foreground">{linked.title}</span>
          <code className="px-1.5 py-0.5 rounded bg-background border border-border text-[10px]">
            {linked.game_id}
          </code>
          {linked.switch_version && (
            <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-bold">
              {linked.switch_version === "switch2" ? "Switch 2" : "Switch"}
            </span>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          غير مرتبط بعد — التسعير أدناه لن يُحفظ في فهرس المقايضة حتى يتم الربط.
        </p>
      )}

      <div className="relative">
        <div className="flex items-center gap-2 border border-border rounded-lg px-3 py-2 bg-background">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            className="flex-1 text-sm bg-transparent outline-none"
            value={query}
            placeholder={defaultQuery ? `ابحث… (مثال: ${defaultQuery})` : "ابحث باسم اللعبة…"}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
          />
          {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </div>

        {open && results.length > 0 && (
          <div className="absolute z-30 mt-1 w-full max-h-72 overflow-auto rounded-lg border border-border bg-card shadow-lg">
            {results.map((row) => (
              <button
                key={row.game_id}
                type="button"
                onClick={() => select(row)}
                className="w-full text-right px-3 py-2 hover:bg-muted/60 flex items-center justify-between gap-2"
              >
                <span className="text-xs font-bold text-foreground truncate">
                  {row.canonical_name || row.title}
                </span>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {Number(row.trade_value_iqd || 0).toLocaleString()} د.ع
                  {Number(row.store_offer_bonus_iqd || 0) > 0 && (
                    <span className="text-emerald-500">
                      {" "}
                      +{Number(row.store_offer_bonus_iqd || 0).toLocaleString()}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
