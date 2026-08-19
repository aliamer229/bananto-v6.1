import { useCallback, useEffect, useMemo, useState } from "react";

interface AdminReview {
  id: string;
  product_id: string;
  user_id: string;
  order_id: string | null;
  rating: number;
  comment: string;
  status: string;
  created_at: string;
  user_name?: string | null;
}

/** Admin moderation for member product reviews stored in Cloudflare D1. */
export default function ReviewsManager() {
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "approved" | "hidden">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reviews?scope=all", { credentials: "include" });
      const data = (await res.json()) as { reviews?: AdminReview[] };
      setReviews(data.reviews ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id: string, action: "approve" | "hide" | "delete") => {
    await fetch("/api/reviews", {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    await load();
  };

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return reviews.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (!term) return true;
      return `${r.comment} ${r.user_name ?? ""} ${r.product_id}`.toLowerCase().includes(term);
    });
  }, [reviews, query, filter]);

  const average = rows.length
    ? Math.round((rows.reduce((s, r) => s + Number(r.rating || 0), 0) / rows.length) * 10) / 10
    : 0;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="بحث في التقييمات..."
          className="min-w-[200px] flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm"
        />
        {(["all", "approved", "hidden"] as const).map((value) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`rounded-xl px-3 py-2 text-xs font-bold ${
              filter === value
                ? "bg-[var(--brand-red)] text-white"
                : "border border-border bg-card text-foreground"
            }`}
          >
            {value === "all" ? "الكل" : value === "approved" ? "منشور" : "مخفي"}
          </button>
        ))}
        <span className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold">
          {rows.length} تقييم · معدل {average} ★
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">جاري التحميل...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد تقييمات مطابقة.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border bg-card p-3">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-bold text-foreground">
                  {r.user_name || r.user_id.slice(0, 8)}
                </span>
                <span>{"★".repeat(Math.max(1, Math.min(5, r.rating)))}</span>
                <span>{new Date(r.created_at).toLocaleDateString("ar")}</span>
                <span className="rounded-lg bg-[var(--page-2)] px-2 py-0.5">{r.product_id}</span>
                {r.status === "hidden" && (
                  <span className="rounded-lg bg-red-500/15 px-2 py-0.5 text-red-500">مخفي</span>
                )}
              </div>
              <p className="whitespace-pre-wrap text-sm text-foreground">{r.comment || "—"}</p>
              <div className="mt-2 flex gap-2">
                {r.status !== "approved" && (
                  <button
                    onClick={() => void act(r.id, "approve")}
                    className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white"
                  >
                    نشر
                  </button>
                )}
                {r.status !== "hidden" && (
                  <button
                    onClick={() => void act(r.id, "hide")}
                    className="rounded-lg border border-border px-3 py-1 text-xs font-bold"
                  >
                    إخفاء
                  </button>
                )}
                <button
                  onClick={() => void act(r.id, "delete")}
                  className="rounded-lg bg-red-600 px-3 py-1 text-xs font-bold text-white"
                >
                  حذف
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
