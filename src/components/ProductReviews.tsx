import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/hooks/useAuth";

interface PublicReview {
  id: string;
  rating: number;
  comment: string;
  created_at: string;
  user_name?: string | null;
}

/** Member ratings for one product, served from Cloudflare D1. */
export default function ProductReviews({ productId }: { productId: string }) {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [summary, setSummary] = useState({ count: 0, average: 0 });
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/reviews?productId=${encodeURIComponent(productId)}`, {
      credentials: "include",
    });
    const data = (await res.json()) as {
      reviews?: PublicReview[];
      summary?: { count: number; average: number };
    };
    setReviews(data.reviews ?? []);
    setSummary(data.summary ?? { count: 0, average: 0 });
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    setSaving(true);
    try {
      await fetch("/api/reviews", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId, rating, comment }),
      });
      setComment("");
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mx-auto max-w-6xl space-y-3 p-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">تقييمات الأعضاء</h2>
        <span className="text-sm text-muted-foreground">
          {summary.count ? `${summary.average} ★ من ${summary.count} تقييم` : "لا توجد تقييمات بعد"}
        </span>
      </div>

      {user ? (
        <div className="space-y-2 rounded-2xl border border-border bg-card p-3">
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                onClick={() => setRating(value)}
                aria-label={`تقييم ${value}`}
                className={`text-xl ${value <= rating ? "text-amber-400" : "text-muted-foreground"}`}
              >
                ★
              </button>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="شاركنا تجربتك مع هذه اللعبة..."
            className="w-full rounded-xl border border-border bg-[var(--page-2)] p-2 text-sm"
          />
          <button
            onClick={() => void submit()}
            disabled={saving}
            className="rounded-xl bg-[var(--brand-red)] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            {saving ? "جاري الإرسال..." : "إرسال التقييم"}
          </button>
        </div>
      ) : (
        <p className="rounded-2xl border border-border bg-card p-3 text-sm text-muted-foreground">
          سجّل الدخول لإضافة تقييمك.
        </p>
      )}

      <div className="space-y-2">
        {reviews.map((r) => (
          <article key={r.id} className="rounded-2xl border border-border bg-card p-3">
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-bold text-foreground">{r.user_name || "عضو"}</span>
              <span className="text-amber-400">
                {"★".repeat(Math.max(1, Math.min(5, r.rating)))}
              </span>
              <span>{new Date(r.created_at).toLocaleDateString("ar")}</span>
            </div>
            {r.comment && (
              <p className="whitespace-pre-wrap text-sm text-foreground">{r.comment}</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
