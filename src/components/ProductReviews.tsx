import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, Edit2, ShieldCheck, Star } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import { playSound } from "@/utils/audio";

interface PublicReview {
  id: string;
  rating: number;
  comment: string;
  created_at: string;
  is_buyer?: boolean;
  user_name?: string | null;
}

interface MyReview extends PublicReview {
  status: string;
}

/** Member ratings for one product, served from Cloudflare D1. */
export default function ProductReviews({ productId }: { productId: string }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [myReview, setMyReview] = useState<MyReview | null>(null);
  const [summary, setSummary] = useState({ count: 0, average: 0 });
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/reviews?productId=${encodeURIComponent(productId)}`, {
        credentials: "include",
      });
      const data = (await res.json()) as {
        reviews?: PublicReview[];
        myReview?: MyReview | null;
        summary?: { count: number; average: number };
      };
      setReviews(data.reviews ?? []);
      setMyReview(data.myReview ?? null);
      if (data.myReview) {
        setRating(data.myReview.rating);
        setComment(data.myReview.comment);
      }
      setSummary(data.summary ?? { count: 0, average: 0 });
    } catch {}
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    setSaving(true);
    setSuccessMsg("");
    try {
      playSound("select", 0.6);
      await fetch("/api/reviews", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId, rating, comment }),
      });
      setIsEditing(false);
      setSuccessMsg("تم حفظ التقييم بنجاح، وسيظهر بعد موافقة الإدارة.");
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mx-auto max-w-6xl space-y-4 p-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">تقييمات وتجارب اللاعبين</h2>
        <span className="text-sm text-muted-foreground">
          {summary.count ? `${summary.average} ★ من ${summary.count} تقييم معتمد` : "لا توجد تقييمات معتمدة بعد"}
        </span>
      </div>

      {user ? (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
          {myReview && !isEditing ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-foreground">تقييمك:</span>
                  <div className="flex text-amber-400">
                    {[1, 2, 3, 4, 5].map((val) => (
                      <Star
                        key={val}
                        className={`w-4 h-4 ${val <= myReview.rating ? "fill-current" : "text-muted/30"}`}
                      />
                    ))}
                  </div>
                  {myReview.is_buyer && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-600 border border-emerald-500/20">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      مشتري موثق
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-1 text-xs font-bold text-[var(--brand-red)] hover:underline"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  تعديل التقييم
                </button>
              </div>

              {myReview.comment && (
                <p className="text-sm text-foreground bg-[var(--page-2)] p-3 rounded-xl">
                  {myReview.comment}
                </p>
              )}

              <div className="flex items-center gap-2 pt-1 text-xs">
                {myReview.status === "pending" ? (
                  <span className="flex items-center gap-1 text-amber-600 bg-amber-500/10 px-2.5 py-1 rounded-lg font-bold border border-amber-500/20">
                    <Clock className="w-3.5 h-3.5" />
                    قيد المراجعة في انتظار موافقة الإدارة
                  </span>
                ) : myReview.status === "approved" ? (
                  <span className="flex items-center gap-1 text-emerald-600 bg-emerald-500/10 px-2.5 py-1 rounded-lg font-bold border border-emerald-500/20">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    منشور ومعتمد
                  </span>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-foreground">
                  {myReview ? "تعديل تقييمك" : "أضف تقييمك وتجربتك"}
                </span>
                {isEditing && (
                  <button
                    onClick={() => setIsEditing(false)}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    إلغاء
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setRating(value);
                      playSound("hover_s", 0.5);
                    }}
                    aria-label={`تقييم ${value}`}
                    className="p-1"
                  >
                    <Star
                      className={`w-6 h-6 transition-all ${
                        value <= rating
                          ? "text-amber-400 fill-amber-400 scale-110"
                          : "text-muted/30"
                      }`}
                    />
                  </button>
                ))}
              </div>

              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="شاركنا رأيك وتجربتك بالتفصيل عن هذه اللعبة..."
                className="w-full rounded-xl border border-border bg-[var(--page-2)] p-3 text-sm outline-none focus:border-[var(--brand-red)] transition-colors"
              />

              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">
                  * سيتم فحص ومراجعة التقييم من قبل الإدارة قبل ظهوره لجميع اللاعبين.
                </p>
                <button
                  onClick={() => void submit()}
                  disabled={saving}
                  className="rounded-xl bg-[var(--brand-red)] px-5 py-2 text-sm font-bold text-white shadow-md active:scale-95 disabled:opacity-60 transition-all"
                >
                  {saving ? "جاري الحفظ..." : myReview ? "تحديث التقييم" : "إرسال التقييم"}
                </button>
              </div>
            </div>
          )}

          {successMsg && (
            <p className="text-xs text-emerald-600 bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20 font-bold">
              {successMsg}
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground flex items-center justify-between">
          <span>سجّل الدخول إلى حسابك لتتمكن من تقييم اللعبة ومشاركة رأيك.</span>
        </div>
      )}

      <div className="space-y-3">
        {reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            كن أول من يقيّم هذه اللعبة بعد تجربتها!
          </p>
        ) : (
          reviews.map((r) => (
            <article key={r.id} className="rounded-2xl border border-border bg-card p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-foreground">{r.user_name || "عضو بنانا"}</span>
                  {r.is_buyer ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-extrabold text-emerald-600 border border-emerald-500/20">
                      <ShieldCheck className="w-3 h-3" />
                      مشتري موثق
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                      عضو
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex text-amber-400">
                    {[1, 2, 3, 4, 5].map((val) => (
                      <Star
                        key={val}
                        className={`w-3.5 h-3.5 ${val <= r.rating ? "fill-current" : "text-muted/30"}`}
                      />
                    ))}
                  </div>
                  <span className="text-muted-foreground">{new Date(r.created_at).toLocaleDateString("ar")}</span>
                </div>
              </div>

              {r.comment && (
                <p className="whitespace-pre-wrap text-sm text-foreground leading-relaxed pt-1">
                  {r.comment}
                </p>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
