import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Search,
  Save,
  RefreshCw,
  AlertTriangle,
  Percent,
  Download,
  Lock,
  Unlock,
  CheckCircle2,
  Gift,
  Coins,
  ShieldCheck,
  X,
  FileSpreadsheet,
  Plus,
  Trash2,
  Edit2,
  SlidersHorizontal,
  Check,
} from "lucide-react";
import {
  CATEGORY_LABEL_AR,
  type TradeRule,
  groupRulesByCategory,
  orderedCategories,
} from "@/lib/trade-calc";
import TradeRulesManager from "./services/TradeRulesManager";

interface CatalogRow {
  game_id: string;
  title: string;
  publisher?: string | null;
  switch_version?: string | null;
  trade_value_iqd?: number | null;
  store_offer_bonus_iqd?: number | null;
  trade_value_locked?: number | null;
  trade_enabled?: number | null;
  ai_suggested_trade_iqd?: number | null;
  trade_value_updated_at?: string | null;
  completeness?: number | null;
  needs_review?: number | null;
}

interface ImportReport {
  success: boolean;
  totalProcessed: number;
  matchedExisting: number;
  createdNew: number;
  updatedPrices: number;
  skippedLocked: number;
  errors: string[];
}

const money = (n: number) => Math.round(n).toLocaleString("en-US");

export default function TradePriceManager() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"catalog" | "rules">("catalog");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [version, setVersion] = useState("");
  const [sort, setSort] = useState("updated");
  const [drafts, setDrafts] = useState<
    Record<
      string,
      {
        base?: string;
        bonus?: string;
        locked?: boolean;
        enabled?: boolean;
      }
    >
  >({});
  const [bulkPercent, setBulkPercent] = useState("");
  const [saving, setSaving] = useState(false);

  // Batch Import state
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    current: number;
    total: number;
    percent: number;
  }>({
    current: 0,
    total: 0,
    percent: 0,
  });
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [overwriteLockedOnImport, setOverwriteLockedOnImport] = useState(false);

  // Rule Editing state
  const [editingRule, setEditingRule] = useState<TradeRule | null>(null);
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState<{
    id?: string;
    category: string;
    key: string;
    label_ar: string;
    label_en: string;
    percent: number;
    sort_order: number;
    active: boolean;
  }>({
    category: "box_presence",
    key: "",
    label_ar: "",
    label_en: "",
    percent: 0,
    sort_order: 1,
    active: true,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-trade-catalog", q, filter, version, sort],
    queryFn: async () => {
      const params = new URLSearchParams({ q, filter, version, sort, limit: "150" });
      const res = await fetch(`/api/game-catalog?${params.toString()}`);
      if (!res.ok) return { items: [] as CatalogRow[], stats: {} as Record<string, number> };
      return (await res.json()) as { items: CatalogRow[]; stats: Record<string, number> };
    },
  });

  const { data: rulesData } = useQuery({
    queryKey: ["trade-rules"],
    queryFn: async () => {
      const res = await fetch("/api/game-catalog?mode=rules");
      if (!res.ok) return { rules: [] as TradeRule[] };
      return (await res.json()) as { rules: TradeRule[] };
    },
    staleTime: 5 * 60 * 1000,
  });
  const rules = rulesData?.rules ?? [];
  const grouped = useMemo(() => groupRulesByCategory(rules), [rules]);
  const categories = useMemo(() => orderedCategories(rules), [rules]);

  const items = data?.items ?? [];
  const stats = data?.stats ?? {};
  const dirty = Object.keys(drafts).length;

  const post = async (payload: Record<string, unknown>) => {
    setSaving(true);
    try {
      await fetch("/api/game-catalog", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      await qc.invalidateQueries({ queryKey: ["admin-trade-catalog"] });
      setDrafts({});
    } finally {
      setSaving(false);
    }
  };

  const saveAll = () => {
    const updates = Object.entries(drafts).map(([game_id, d]) => {
      const original = items.find((i) => i.game_id === game_id);
      return {
        game_id,
        trade_value_iqd:
          d.base !== undefined ? Number(d.base || 0) : Number(original?.trade_value_iqd || 0),
        store_offer_bonus_iqd:
          d.bonus !== undefined
            ? Number(d.bonus || 0)
            : Number(original?.store_offer_bonus_iqd || 0),
        trade_value_locked: d.locked !== undefined ? d.locked : original?.trade_value_locked === 1,
        trade_enabled: d.enabled !== undefined ? d.enabled : original?.trade_enabled !== 0,
      };
    });

    return post({
      action: "bulk_price",
      updates,
    });
  };

  // Chunked Batch Import to handle 600+ games safely without request timeout
  const handleImportCatalog = async () => {
    setImporting(true);
    setImportReport(null);
    let offset = 0;
    const limit = 50;
    let hasMore = true;

    const accumulatedReport: ImportReport = {
      success: true,
      totalProcessed: 0,
      matchedExisting: 0,
      createdNew: 0,
      updatedPrices: 0,
      skippedLocked: 0,
      errors: [],
    };

    try {
      while (hasMore) {
        const res = await fetch("/api/game-catalog", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "import_trade_catalog",
            overwrite_locked: overwriteLockedOnImport,
            offset,
            limit,
          }),
        });
        const resJson = await res.json();
        if (!resJson.success || !resJson.result) {
          accumulatedReport.errors.push(`فشل استيراد الدفعة ابتداءً من ${offset}`);
          break;
        }

        const batch = resJson.result;
        accumulatedReport.totalProcessed += batch.totalProcessed;
        accumulatedReport.matchedExisting += batch.matchedExisting;
        accumulatedReport.createdNew += batch.createdNew;
        accumulatedReport.updatedPrices += batch.updatedPrices;
        accumulatedReport.skippedLocked += batch.skippedLocked;
        if (Array.isArray(batch.errors)) {
          accumulatedReport.errors.push(...batch.errors);
        }

        const total = batch.total || 1;
        const currentDone = offset + batch.totalProcessed;
        const percent = Math.min(100, Math.round((currentDone / total) * 100));
        setImportProgress({ current: currentDone, total, percent });

        hasMore = Boolean(batch.hasMore);
        offset = batch.nextOffset;
      }

      setImportReport(accumulatedReport);
      await qc.invalidateQueries({ queryKey: ["admin-trade-catalog"] });
    } catch (err) {
      console.error("Batch import error:", err);
      accumulatedReport.errors.push("حدث خطأ غير متوقع أثناء المعالجة بالدفعات.");
      setImportReport(accumulatedReport);
    } finally {
      setImporting(false);
    }
  };

  const applyPercent = () => {
    const pct = Number(bulkPercent);
    if (!pct) return;
    const updates = items
      .filter((g) => Number(g.trade_value_iqd || 0) > 0)
      .map((g) => ({
        game_id: g.game_id,
        trade_value_iqd: Math.max(0, Math.round(Number(g.trade_value_iqd) * (1 + pct / 100))),
        store_offer_bonus_iqd: Number(g.store_offer_bonus_iqd || 0),
      }));
    if (updates.length) post({ action: "bulk_price", updates });
  };

  const toggleLock = (g: CatalogRow) => {
    const currentDraft = drafts[g.game_id] || {};
    const currentlyLocked =
      currentDraft.locked !== undefined ? currentDraft.locked : g.trade_value_locked === 1;
    setDrafts((prev) => ({
      ...prev,
      [g.game_id]: {
        ...currentDraft,
        locked: !currentlyLocked,
      },
    }));
  };

  const toggleEnabled = (g: CatalogRow) => {
    const currentDraft = drafts[g.game_id] || {};
    const currentlyEnabled =
      currentDraft.enabled !== undefined ? currentDraft.enabled : g.trade_enabled !== 0;
    setDrafts((prev) => ({
      ...prev,
      [g.game_id]: {
        ...currentDraft,
        enabled: !currentlyEnabled,
      },
    }));
  };

  // Rule CRUD handlers
  const openNewRuleModal = (category = "box_presence") => {
    setEditingRule(null);
    setRuleForm({
      category,
      key: "",
      label_ar: "",
      label_en: "",
      percent: 0,
      sort_order: 10,
      active: true,
    });
    setIsRuleModalOpen(true);
  };

  const openEditRuleModal = (rule: TradeRule) => {
    setEditingRule(rule);
    setRuleForm({
      id: rule.id,
      category: rule.category,
      key: rule.key,
      label_ar: rule.label_ar,
      label_en: rule.label_en || "",
      percent: Number(rule.percent),
      sort_order: rule.sort_order,
      active: rule.active === 1 || rule.active === true,
    });
    setIsRuleModalOpen(true);
  };

  const handleSaveRule = async () => {
    if (!ruleForm.category || !ruleForm.key || !ruleForm.label_ar) return;
    setSaving(true);
    try {
      await fetch("/api/game-catalog", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "save_rule",
          ...ruleForm,
        }),
      });
      await qc.invalidateQueries({ queryKey: ["trade-rules"] });
      setIsRuleModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleRule = async (ruleId: string) => {
    await fetch("/api/game-catalog", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "toggle_rule", id: ruleId }),
    });
    await qc.invalidateQueries({ queryKey: ["trade-rules"] });
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm("هل أنت متأكد من حذف هذه القاعدة نهائياً؟")) return;
    await fetch("/api/game-catalog", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "delete_rule", id: ruleId }),
    });
    await qc.invalidateQueries({ queryKey: ["trade-rules"] });
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-500" />
            محرك تسعير وقواعد استبدال ألعاب نينتندو
          </h2>
          <p className="text-sm text-muted-foreground">
            إدارة الكتالوج الرسمي، مكافآت رصيد المتجر، وقواعد نسب وفحص المقايضة.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Tab Switcher */}
          <div className="bg-muted p-1 rounded-xl flex items-center gap-1 border border-border">
            <button
              onClick={() => setActiveTab("catalog")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === "catalog"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              🎮 تسعير ألعاب الكتالوج
            </button>
            <button
              onClick={() => setActiveTab("rules")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === "rules"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              ⚙️ قواعد ونسب الحساب
            </button>
          </div>

          <button
            onClick={() => {
              setShowImportModal(true);
              setImportReport(null);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-sm transition-all"
          >
            <FileSpreadsheet className="w-4 h-4" />
            استيراد تسعيرة العراق
          </button>
          {dirty > 0 && activeTab === "catalog" && (
            <button
              onClick={saveAll}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-md animate-in fade-in"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              حفظ {dirty} تعديل
            </button>
          )}
          <button
            onClick={() => {
              qc.invalidateQueries({ queryKey: ["admin-trade-catalog"] });
              qc.invalidateQueries({ queryKey: ["trade-rules"] });
            }}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card hover:bg-muted font-bold text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            تحديث
          </button>
        </div>
      </div>

      {activeTab === "catalog" ? (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {[
              { label: "إجمالي الألعاب", value: stats["total"] ?? 0, color: "text-foreground" },
              { label: "ألعاب Switch 2", value: stats["switch2"] ?? 0, color: "text-red-500" },
              { label: "تحتوي مكافأة", value: stats["with_bonus"] ?? 0, color: "text-emerald-500" },
              {
                label: "استبدال مفعّل",
                value: stats["trade_enabled_count"] ?? 0,
                color: "text-blue-500",
              },
              { label: "أسعار مقفلة", value: stats["locked_count"] ?? 0, color: "text-amber-500" },
              { label: "بدون تسعير", value: stats["no_price"] ?? 0, color: "text-rose-500" },
            ].map((s) => (
              <div
                key={s.label}
                className="bg-card border border-border rounded-2xl p-3.5 shadow-sm"
              >
                <div className="text-[11px] text-muted-foreground font-bold">{s.label}</div>
                <div className={`text-xl font-black mt-1 ${s.color}`}>
                  {money(Number(s.value || 0))}
                </div>
              </div>
            ))}
          </div>

          {/* Filter and Search Bar */}
          <div className="bg-card border border-border rounded-2xl p-4 flex flex-wrap gap-3 items-center shadow-sm">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="بحث باسم اللعبة أو الكتالوج..."
                className="w-full bg-background border border-border rounded-xl py-2 pr-9 pl-3 text-sm outline-none focus:border-primary"
              />
            </div>
            <select
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="bg-background border border-border rounded-xl px-3 py-2 text-sm font-medium"
            >
              <option value="">كل الأجهزة</option>
              <option value="switch1">Nintendo Switch 1</option>
              <option value="switch2">Nintendo Switch 2</option>
              <option value="both">كلا الجيلين</option>
            </select>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-background border border-border rounded-xl px-3 py-2 text-sm font-medium"
            >
              <option value="">كل الحالات</option>
              <option value="no_price">بدون سعر</option>
              <option value="stale">سعر قديم (+90 يوم)</option>
              <option value="needs_review">تحتاج مراجعة</option>
              <option value="incomplete">بيانات ناقصة</option>
            </select>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="bg-background border border-border rounded-xl px-3 py-2 text-sm font-medium"
            >
              <option value="updated">الأحدث تعديلاً</option>
              <option value="price">الأعلى سعراً</option>
              <option value="title">أبجدياً (A-Z)</option>
            </select>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Percent className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  value={bulkPercent}
                  onChange={(e) => setBulkPercent(e.target.value)}
                  placeholder="±%"
                  className="w-20 bg-background border border-border rounded-xl py-2 pr-7 pl-2 text-sm outline-none focus:border-primary"
                />
              </div>
              <button
                onClick={applyPercent}
                disabled={saving || !bulkPercent}
                className="px-3 py-2 rounded-xl border border-border bg-muted/40 hover:bg-muted text-sm font-bold disabled:opacity-40"
              >
                تعديل النسبة
              </button>
            </div>
          </div>

          {/* Catalog Table */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            {isLoading ? (
              <div className="p-16 text-center text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary mb-2" />
                <span className="text-sm">جاري تحميل كتالوج الاستبدال...</span>
              </div>
            ) : items.length === 0 ? (
              <div className="p-16 text-center text-muted-foreground text-sm space-y-3">
                <Coins className="w-10 h-10 mx-auto opacity-30" />
                <p>لا توجد نتائج مطابقة لبحثك.</p>
                <button
                  onClick={() => setShowImportModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs"
                >
                  استيراد كتالوج نينتندو العراق الآن
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground border-b border-border">
                    <tr>
                      <th className="text-right p-3 font-bold">اللعبة</th>
                      <th className="text-right p-3 font-bold">المنصة</th>
                      <th className="text-right p-3 font-bold">القيمة الأساسية (د.ع)</th>
                      <th className="text-right p-3 font-bold">مكافأة المتجر (د.ع)</th>
                      <th className="text-right p-3 font-bold">إجمالي رصيد المتجر</th>
                      <th className="text-center p-3 font-bold">القفل</th>
                      <th className="text-center p-3 font-bold">التفعيل</th>
                      <th className="text-right p-3 font-bold">آخر تحديث</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {items.map((g) => {
                      const draft = drafts[g.game_id] || {};
                      const baseValStr = draft.base ?? String(g.trade_value_iqd ?? 0);
                      const bonusValStr = draft.bonus ?? String(g.store_offer_bonus_iqd ?? 0);
                      const baseNum = Number(baseValStr) || 0;
                      const bonusNum = Number(bonusValStr) || 0;
                      const totalStoreCredit = baseNum + bonusNum;

                      const isLocked =
                        draft.locked !== undefined ? draft.locked : g.trade_value_locked === 1;
                      const isEnabled =
                        draft.enabled !== undefined ? draft.enabled : g.trade_enabled !== 0;

                      return (
                        <tr key={g.game_id} className="hover:bg-muted/30 transition-colors">
                          <td className="p-3 font-bold">
                            <div className="flex items-center gap-2">
                              {g.needs_review ? (
                                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                              ) : null}
                              <span className="text-foreground">{g.title}</span>
                            </div>
                            <div className="text-[11px] font-normal text-muted-foreground mt-0.5">
                              {g.publisher || "Nintendo"} • اكتمال {Number(g.completeness || 0)}%
                            </div>
                          </td>
                          <td className="p-3">
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-bold inline-block ${
                                g.switch_version === "switch2"
                                  ? "bg-red-500/10 text-red-600 dark:text-red-400"
                                  : g.switch_version === "both"
                                    ? "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                                    : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {g.switch_version === "switch2"
                                ? "Switch 2"
                                : g.switch_version === "both"
                                  ? "Dual 1+2"
                                  : "Switch 1"}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="relative w-28">
                              <input
                                value={baseValStr}
                                onChange={(e) =>
                                  setDrafts((d) => ({
                                    ...d,
                                    [g.game_id]: {
                                      ...(d[g.game_id] || {}),
                                      base: e.target.value,
                                    },
                                  }))
                                }
                                inputMode="numeric"
                                className="w-full bg-background border border-border focus:border-primary rounded-lg px-2.5 py-1.5 text-sm font-bold outline-none"
                              />
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="relative w-28">
                              <input
                                value={bonusValStr}
                                onChange={(e) =>
                                  setDrafts((d) => ({
                                    ...d,
                                    [g.game_id]: {
                                      ...(d[g.game_id] || {}),
                                      bonus: e.target.value,
                                    },
                                  }))
                                }
                                inputMode="numeric"
                                className={`w-full bg-background border rounded-lg px-2.5 py-1.5 text-sm font-bold outline-none ${
                                  bonusNum > 0
                                    ? "border-emerald-500/50 text-emerald-600 dark:text-emerald-400"
                                    : "border-border"
                                }`}
                              />
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1.5">
                              <span className="font-black text-sm text-foreground">
                                {money(totalStoreCredit)}
                              </span>
                              <span className="text-[11px] text-muted-foreground">د.ع</span>
                              {bonusNum > 0 && (
                                <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded font-bold">
                                  +{money(bonusNum)}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => toggleLock(g)}
                              title={
                                isLocked ? "السعر مقفل ضد التحديث التلقائي" : "السعر قابل للتحديث"
                              }
                              className={`p-1.5 rounded-lg border transition-colors ${
                                isLocked
                                  ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
                                  : "bg-muted/40 border-border text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {isLocked ? (
                                <Lock className="w-4 h-4" />
                              ) : (
                                <Unlock className="w-4 h-4" />
                              )}
                            </button>
                          </td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => toggleEnabled(g)}
                              className={`text-xs px-2.5 py-1 rounded-full font-bold transition-colors ${
                                isEnabled
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
                                  : "bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20"
                              }`}
                            >
                              {isEnabled ? "مفعّل" : "معطّل"}
                            </button>
                          </td>
                          <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                            {g.trade_value_updated_at ? g.trade_value_updated_at.slice(0, 10) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Rules Management Tab */
        <TradeRulesManager embedded />
      )}

      {/* Batch Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-black text-lg flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-500" />
                استيراد وتحديث تسعيرة نينتندو العراق (بالدفعات)
              </h3>
              <button
                onClick={() => {
                  if (!importing) {
                    setShowImportModal(false);
                    setImportReport(null);
                  }
                }}
                disabled={importing}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-40"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!importReport ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  يقوم هذا الإجراء بقراءة جدول أسعار الاستبدال ومكافآت رصيد المتجر لجميع ألعاب
                  Nintendo Switch 1 و Switch 2 في العراق، ومطابقتها برمجياً بالدفعات (50 لعبة لكل
                  دفعة) لتفادي انقطاع الاتصال أو تجاوز وقت المعالجة.
                </p>

                <div className="bg-muted/40 p-4 rounded-2xl space-y-2 text-xs">
                  <div className="flex items-center gap-2 font-bold text-foreground">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    تحديث القيمة الأساسية (Trade Price) ومكافأة رصيد المتجر (Store Offer Bonus).
                  </div>
                  <div className="flex items-center gap-2 font-bold text-foreground">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    إضافة ألعاب جديدة تلقائياً إذا لم تكن مسجلة بالكتالوج.
                  </div>
                  <div className="flex items-center gap-2 font-bold text-foreground">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    معالجة تسلسلية سلسة مع شريط تقدم مباشر.
                  </div>
                </div>

                <label className="flex items-center gap-3 p-3 bg-muted/20 border border-border rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overwriteLockedOnImport}
                    onChange={(e) => setOverwriteLockedOnImport(e.target.checked)}
                    disabled={importing}
                    className="w-4 h-4 rounded text-primary"
                  />
                  <span className="text-xs font-bold text-foreground">
                    الكتابة فوق الأسعار المقفلة يدوياً (Overwrite Locked Prices)
                  </span>
                </label>

                {importing && (
                  <div className="space-y-2 p-4 bg-muted/50 rounded-2xl border border-primary/20 animate-in fade-in">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="flex items-center gap-1.5 text-primary">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        جاري معالجة الكتالوج بالدفعات...
                      </span>
                      <span>
                        {importProgress.current} / {importProgress.total} ({importProgress.percent}
                        %)
                      </span>
                    </div>
                    <div className="w-full bg-border h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full transition-all duration-300 rounded-full"
                        style={{ width: `${importProgress.percent}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleImportCatalog}
                    disabled={importing}
                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {importing ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        بدء الاستيراد بالدفعات الآن
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setShowImportModal(false)}
                    disabled={importing}
                    className="px-5 py-3 border border-border rounded-xl font-bold text-sm hover:bg-muted disabled:opacity-40"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl text-center">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                  <h4 className="font-black text-foreground">اكتمل الاستيراد والتحديث بنجاح!</h4>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-muted p-3 rounded-xl">
                    <span className="text-muted-foreground block">إجمالي المعالجة</span>
                    <span className="text-base font-black">{importReport.totalProcessed}</span>
                  </div>
                  <div className="bg-muted p-3 rounded-xl">
                    <span className="text-muted-foreground block">تم تحديث أسعارها</span>
                    <span className="text-base font-black text-emerald-600">
                      {importReport.updatedPrices}
                    </span>
                  </div>
                  <div className="bg-muted p-3 rounded-xl">
                    <span className="text-muted-foreground block">ألعاب جديدة أُنشئت</span>
                    <span className="text-base font-black text-blue-600">
                      {importReport.createdNew}
                    </span>
                  </div>
                  <div className="bg-muted p-3 rounded-xl">
                    <span className="text-muted-foreground block">تخطى (مقفلة)</span>
                    <span className="text-base font-black text-amber-600">
                      {importReport.skippedLocked}
                    </span>
                  </div>
                </div>

                {importReport.errors.length > 0 && (
                  <div className="max-h-32 overflow-y-auto bg-rose-500/10 p-3 rounded-xl text-[11px] text-rose-600 space-y-1">
                    <div className="font-bold">تنبيهات أثناء الاستيراد:</div>
                    {importReport.errors.map((e, idx) => (
                      <div key={idx}>• {e}</div>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => {
                    setShowImportModal(false);
                    setImportReport(null);
                  }}
                  className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-xl"
                >
                  إغلاق وتحديث القائمة
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
