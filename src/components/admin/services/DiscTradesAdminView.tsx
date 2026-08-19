import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw,
  Search,
  Clock,
  Save,
  Edit3,
  Loader2,
  CheckCircle,
  XCircle,
  PlusCircle,
  Image as ImageIcon,
  ExternalLink,
  Gamepad2,
  FileText,
  Sliders,
  SlidersHorizontal,
  ListFilter,
  ArrowLeftRight,
  Wallet,
} from "lucide-react";
import { useI18n } from "@/i18n";
import {
  TRADE_STATUS_LABEL_AR,
  TRADE_STATUS_BADGE_STYLE,
  canTransition,
  normalizeTradeStatus,
  CATEGORY_LABEL_AR,
  type TradeStatus,
} from "@/lib/trade-calc";
import { DiscTradePageEditor } from "./editors/DiscTradePageEditor";
import TradeRulesManager from "./TradeRulesManager";

export default function DiscTradesAdminView() {
  const t = useI18n((s) => s.t);
  const lang = useI18n((s) => s.lang);
  const dir = lang === "ar" ? "rtl" : "ltr";
  const queryClient = useQueryClient();

  const [viewMode, setViewMode] = useState<"trades" | "rules" | "settings">("trades");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin_disc_trades"],
    queryFn: async () => {
      const res = await fetch("/api/disc-trade?scope=admin");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const updateTrade = useMutation({
    mutationFn: async (vars: any) => {
      const res = await fetch("/api/disc-trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "admin_update", trade_id: vars.id, ...vars }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_disc_trades"] });
      setEditingId(null);
    },
  });

  const trades = data?.items || [];
  const filtered = trades.filter((r: any) => {
    const norm = normalizeTradeStatus(r.status);
    if (filterStatus !== "all" && norm !== filterStatus) return false;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      return (
        r.game_name?.toLowerCase().includes(s) ||
        r.id?.toLowerCase().includes(s) ||
        r.user_id?.toLowerCase().includes(s) ||
        r.platform?.toLowerCase().includes(s)
      );
    }
    return true;
  });

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <ArrowLeftRight className="w-6 h-6 text-primary" /> {t("خدمة استبدال ومقايضة الأقراص")}
          </h1>
          <p className="text-muted-foreground text-xs mt-1">
            {t("مراجعة وتسعير طلبات المقايضة وتعديل إعدادات ونصوص واجهة صفحة الاستبدال.")}
          </p>
        </div>

        <div className="flex items-center gap-2 bg-muted p-1 rounded-xl border border-border">
          <button
            type="button"
            onClick={() => setViewMode("trades")}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${
              viewMode === "trades"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ListFilter className="w-4 h-4" />
            {t("طلبات الاستبدال")} ({trades.length})
          </button>
          <button
            type="button"
            onClick={() => setViewMode("rules")}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${
              viewMode === "rules"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <SlidersHorizontal className="w-4 h-4 text-primary" />
            {t("نسب وقواعد التقييم")}
          </button>
          <button
            type="button"
            onClick={() => setViewMode("settings")}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${
              viewMode === "settings"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sliders className="w-4 h-4 text-muted-foreground" />
            {t("تخصيص نصوص الصفحة")}
          </button>
        </div>
      </div>

      {viewMode === "rules" ? (
        <TradeRulesManager />
      ) : viewMode === "settings" ? (
        <DiscTradePageEditor />
      ) : (
        <>
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search
                className={`absolute ${dir === "rtl" ? "right-3" : "left-3"} top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`}
              />
              <input
                type="text"
                placeholder={t("بحث باسم اللعبة، المنصة، رقم الطلب...")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full bg-card border border-border rounded-xl py-2.5 ${
                  dir === "rtl" ? "pr-10 pl-4" : "pl-10 pr-4"
                } text-sm focus:border-primary focus:outline-none`}
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-card border border-border rounded-xl px-4 py-2 text-sm focus:border-primary focus:outline-none font-bold"
            >
              <option value="all">{t("كل الحالات")}</option>
              <option value="waiting_review">{t("بانتظار المراجعة")}</option>
              <option value="waiting_shipment">{t("بانتظار الشحن/التسليم")}</option>
              <option value="received">{t("تم الاستلام")}</option>
              <option value="inspecting">{t("قيد الفحص")}</option>
              <option value="approved">{t("تمت الموافقة")}</option>
              <option value="coupon_issued">{t("تم إصدار الكوبون")}</option>
              <option value="cash_paid">{t("تم الدفع نقداً")}</option>
              <option value="completed">{t("مكتملة ومودعة")}</option>
              <option value="rejected">{t("مرفوضة")}</option>
              <option value="cancelled">{t("ملغاة")}</option>
            </select>
          </div>

          {isLoading ? (
            <div className="py-20 flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-4">
              {filtered.map((trade: any) => (
                <TradeCard
                  key={trade.id}
                  trade={trade}
                  isEditing={editingId === trade.id}
                  onEdit={() => setEditingId(trade.id)}
                  onCancel={() => setEditingId(null)}
                  onSave={(updates: any) => updateTrade.mutate({ id: trade.id, ...updates })}
                  isSaving={updateTrade.isPending}
                  t={t}
                />
              ))}
              {filtered.length === 0 && (
                <div className="text-center py-16 text-muted-foreground bg-card border border-border rounded-2xl">
                  {t("لا توجد مقايضات تطابق بحثك.")}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TradeCard({ trade, isEditing, onEdit, onCancel, onSave, isSaving, t }: any) {
  const normStatus = normalizeTradeStatus(trade.status) as TradeStatus;
  const [status, setStatus] = useState<string>(normStatus);
  const [adminValuation, setAdminValuation] = useState(
    trade.admin_valuation_iqd ?? trade.valuation_iqd ?? "",
  );
  const [adminNotes, setAdminNotes] = useState(trade.admin_notes || "");
  const isCustom = !trade.game_id || trade.game_id === "custom";

  const handleSave = () => {
    onSave({
      status,
      admin_valuation_iqd:
        adminValuation !== "" && adminValuation !== null ? Number(adminValuation) : null,
      admin_notes: adminNotes,
    });
  };

  const badgeStyle = TRADE_STATUS_BADGE_STYLE[normStatus] || "bg-muted text-muted-foreground";

  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
      {/* Header Row */}
      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-lg text-foreground">{trade.game_name}</h3>
            {isCustom && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1">
                <PlusCircle className="w-3 h-3" />
                {t("إضافة يدوية")}
              </span>
            )}
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-muted text-muted-foreground">
              {trade.platform || "Nintendo Switch"}
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${badgeStyle}`}>
              {TRADE_STATUS_LABEL_AR[normStatus] || normStatus}
            </span>
            {trade.payout_credited === 1 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 flex items-center gap-1">
                <Wallet className="w-3 h-3" />
                {t("تم إيداع الرصيد بالمحفظة")}
              </span>
            )}
            <span className="text-xs font-mono text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">
              #{trade.id.slice(0, 8)}
            </span>
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-4">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> {new Date(trade.created_at).toLocaleString()}
            </span>
            {trade.user_id && (
              <span className="font-mono text-[11px]">User ID: {trade.user_id.slice(0, 10)}</span>
            )}
          </div>
        </div>

        {!isEditing && (
          <button
            onClick={onEdit}
            className="text-primary hover:bg-primary/10 px-3.5 py-1.5 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-colors border border-primary/20"
          >
            <Edit3 className="w-4 h-4" /> {t("تسعير وإدارة")}
          </button>
        )}
      </div>

      {/* Grid of Key Values */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-3 border-y border-border">
        <div>
          <span className="block text-xs font-bold text-muted-foreground mb-1">
            {t("التقييم التلقائي")}
          </span>
          <div className="text-sm font-medium">
            {trade.base_iqd ? `${Number(trade.base_iqd).toLocaleString()} د.ع` : t("غير مسعر")}
          </div>
        </div>
        <div>
          <span className="block text-xs font-bold text-muted-foreground mb-1">
            {t("القيمة المبدئية")}
          </span>
          <div className="text-sm font-bold text-primary">
            {trade.valuation_iqd
              ? `${Number(trade.valuation_iqd).toLocaleString()} د.ع`
              : t("قيد المراجعة")}
          </div>
        </div>
        <div>
          <span className="block text-xs font-bold text-muted-foreground mb-1">
            {t("الرصيد المعتمد (الإدارة)")}
          </span>
          <div className="text-sm font-bold text-emerald-500">
            {trade.admin_valuation_iqd
              ? `${Number(trade.admin_valuation_iqd).toLocaleString()} د.ع`
              : t("لم يحدد بعد")}
          </div>
        </div>
        <div>
          <span className="block text-xs font-bold text-muted-foreground mb-1">
            {t("نوع التعويض")}
          </span>
          <div className="text-sm font-bold flex items-center gap-1">
            {trade.preferred_trade === "cash" ? (
              t("نقداً")
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400">
                {t("رصيد متجر")}
                {Number(trade.store_offer_bonus_iqd) > 0 && (
                  <span className="text-xs font-normal text-muted-foreground mr-1">
                    (+{Number(trade.store_offer_bonus_iqd).toLocaleString()} بونص)
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Selections & Details Info */}
      <div className="flex flex-wrap gap-4 items-start text-xs">
        {trade.selections && typeof trade.selections === "object" && (
          <div className="flex-1 bg-muted/40 p-3 rounded-xl space-y-1">
            <span className="font-bold text-muted-foreground block mb-1">
              {t("خيارات الحالة:")}
            </span>
            <div className="flex flex-wrap gap-2">
              {Object.entries(trade.selections).map(([k, v]: [string, any]) => (
                <span
                  key={k}
                  className="bg-background border border-border px-2 py-1 rounded-lg text-foreground font-medium"
                >
                  <span className="text-muted-foreground">{CATEGORY_LABEL_AR[k] || k}: </span>
                  <strong>{String(v)}</strong>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Uploaded User Photo */}
        {trade.photo_url && (
          <div className="flex items-center gap-2 bg-muted/40 p-2 rounded-xl">
            <a
              href={trade.photo_url}
              target="_blank"
              rel="noreferrer"
              className="relative group w-14 h-14 rounded-lg overflow-hidden border border-border flex-shrink-0"
            >
              <img
                src={trade.photo_url}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                alt=""
              />
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                <ExternalLink className="w-3.5 h-3.5" />
              </div>
            </a>
            <div className="text-[11px] text-muted-foreground">
              <span className="font-bold text-foreground block">{t("صورة مرفقة")}</span>
              <a
                href={trade.photo_url}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                {t("عرض بحجم كامل")}
              </a>
            </div>
          </div>
        )}
      </div>

      {/* User Notes */}
      {trade.notes && (
        <div className="text-xs bg-muted/60 p-3 rounded-xl text-foreground">
          <strong className="block text-muted-foreground mb-0.5">{t("ملاحظات العميل:")}</strong>
          {trade.notes}
        </div>
      )}

      {/* Editing Form */}
      {isEditing ? (
        <div className="bg-muted p-5 rounded-xl space-y-4 animate-in fade-in slide-in-from-top-2 border border-primary/20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold mb-1.5">{t("تغيير الحالة")}</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm focus:border-primary outline-none font-bold"
              >
                <option value={normStatus}>
                  {TRADE_STATUS_LABEL_AR[normStatus] || normStatus} (الحالية)
                </option>
                {Object.keys(TRADE_STATUS_LABEL_AR)
                  .filter((s) => s !== normStatus && canTransition(normStatus, s, true))
                  .map((s) => (
                    <option key={s} value={s}>
                      {TRADE_STATUS_LABEL_AR[s]} (انتقال)
                    </option>
                  ))}
              </select>
              {!canTransition(normStatus, status, true) && status !== normStatus && (
                <p className="text-xs text-rose-500 mt-1">
                  {t("هذا الانتقال غير مسموح برمجياً وقد يفشل.")}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold mb-1.5 text-emerald-600 dark:text-emerald-400">
                {t("تسعير الإدارة / الرصيد المعتمد (د.ع)")}
              </label>
              <input
                type="number"
                placeholder={t("أدخل القيمة المعتمدة بالدينار")}
                value={adminValuation}
                onChange={(e) => setAdminValuation(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm focus:border-primary outline-none font-bold"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold mb-1.5 text-primary">
              {t("ملاحظات للإدارة وتوضيح للعميل")}
            </label>
            <textarea
              placeholder={t("اكتب أي توضيح للعميل بخصوص التقييم، الاستلام أو حالة القرص...")}
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm focus:border-primary outline-none min-h-[70px]"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-background rounded-xl transition-colors"
            >
              {t("إلغاء")}
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2 text-sm font-bold text-primary-foreground bg-primary rounded-xl hover:opacity-90 transition-opacity flex items-center gap-2 shadow-sm"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}{" "}
              {t("حفظ التحديث والتسعير")}
            </button>
          </div>
        </div>
      ) : (
        trade.admin_notes && (
          <div className="text-sm bg-primary/10 text-primary p-3.5 rounded-xl border border-primary/20">
            <strong className="block mb-1 text-xs font-bold">{t("رسالة الإدارة للعميل:")}</strong>
            {trade.admin_notes}
          </div>
        )
      )}
    </div>
  );
}
