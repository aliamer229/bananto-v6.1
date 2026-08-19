import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  SlidersHorizontal,
  Save,
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Calculator,
  Percent,
  Coins,
  ShieldCheck,
  Package,
  Layers,
  Sparkles,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import {
  CATEGORY_LABEL_AR,
  type TradeRule,
  groupRulesByCategory,
  orderedCategories,
  computeTradeValue,
} from "@/lib/trade-calc";

interface TradeRulesManagerProps {
  embedded?: boolean;
}

export default function TradeRulesManager({ embedded = false }: TradeRulesManagerProps) {
  const t = useI18n((s) => s.t);
  const lang = useI18n((s) => s.lang);
  const queryClient = useQueryClient();

  // Local drafts for inline percentage and active editing
  const [draftPercentages, setDraftPercentages] = useState<Record<string, number>>({});
  const [draftActive, setDraftActive] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  // Modal State for adding/editing rule details
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<TradeRule | null>(null);
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
    sort_order: 10,
    active: true,
  });

  // Interactive Live Simulator state
  const [simBasePrice, setSimBasePrice] = useState<number>(50000);
  const [simSelections, setSimSelections] = useState<Record<string, string>>({});
  const [simPayout, setSimPayout] = useState<"cash" | "store_credit">("store_credit");

  const { data, isLoading } = useQuery({
    queryKey: ["trade-rules"],
    queryFn: async () => {
      const res = await fetch("/api/game-catalog?mode=rules");
      if (!res.ok) return { rules: [] as TradeRule[] };
      return (await res.json()) as { rules: TradeRule[] };
    },
  });

  const rules = data?.rules ?? [];
  const grouped = useMemo(() => groupRulesByCategory(rules), [rules]);
  const categories = useMemo(() => orderedCategories(rules), [rules]);

  // Track dirty changes
  const hasChanges =
    Object.keys(draftPercentages).length > 0 || Object.keys(draftActive).length > 0;

  // Initialize simulator selections when rules load
  React.useEffect(() => {
    if (rules.length > 0 && Object.keys(simSelections).length === 0) {
      const defaults: Record<string, string> = {};
      for (const cat of categories) {
        const first = grouped[cat]?.[0];
        if (first) defaults[cat] = first.key;
      }
      setSimSelections(defaults);
    }
  }, [rules, categories, grouped]);

  // Live simulation calculation using current drafts
  const simulatedQuote = useMemo(() => {
    // Merge drafts into rules for live simulation
    const activeRules = rules.map((r) => {
      const dp = draftPercentages[r.id];
      const da = draftActive[r.id];
      return {
        ...r,
        percent: dp !== undefined ? dp : Number(r.percent),
        active: da !== undefined ? (da ? 1 : 0) : r.active,
      };
    });

    const selectionsWithPayout = {
      ...simSelections,
      payout_method: simPayout,
    };

    const calc = computeTradeValue(simBasePrice, selectionsWithPayout, activeRules);
    const totalDiff = calc.final_iqd - calc.base_iqd;
    const totalPercent = calc.base_iqd > 0 ? Math.round((totalDiff / calc.base_iqd) * 100) : 0;

    return {
      baseIqd: calc.base_iqd,
      lines: calc.lines,
      finalIqd: calc.final_iqd,
      totalDiff,
      totalPercent,
    };
  }, [simBasePrice, simSelections, simPayout, rules, draftPercentages, draftActive]);

  // Handler for inline percentage change
  const handlePercentChange = (ruleId: string, value: number) => {
    setDraftPercentages((prev) => ({
      ...prev,
      [ruleId]: value,
    }));
  };

  // Handler for inline active toggle
  const handleActiveToggle = (ruleId: string, current: boolean) => {
    setDraftActive((prev) => ({
      ...prev,
      [ruleId]: !current,
    }));
  };

  // Save all inline draft changes
  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const updatedRules = rules.map((r) => ({
        ...r,
        percent: draftPercentages[r.id] !== undefined ? draftPercentages[r.id] : Number(r.percent),
        active: draftActive[r.id] !== undefined ? (draftActive[r.id] ? 1 : 0) : r.active,
      }));

      const res = await fetch("/api/game-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulk_save_rules",
          rules: updatedRules,
        }),
      });

      if (!res.ok) throw new Error("Failed to save rules");

      setDraftPercentages({});
      setDraftActive({});
      await queryClient.invalidateQueries({ queryKey: ["trade-rules"] });
      toast.success(
        lang === "ar" ? "تم حفظ نسب وقواعد المقايضة بنجاح!" : "Trade percentages saved!",
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // Reset to default factory rules
  const handleResetToDefault = async () => {
    if (
      !confirm(
        lang === "ar"
          ? "هل أنت متأكد من استعادة نسب وقواعد المقايضة الافتراضية الرسمية؟"
          : "Are you sure you want to reset all trade rules to defaults?",
      )
    ) {
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/game-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset_rules_default" }),
      });
      if (!res.ok) throw new Error("Reset failed");
      setDraftPercentages({});
      setDraftActive({});
      await queryClient.invalidateQueries({ queryKey: ["trade-rules"] });
      toast.success(
        lang === "ar"
          ? "تمت استعادة النسب والقواعد الافتراضية بنجاح"
          : "Trade rules reset to defaults",
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to reset");
    } finally {
      setSaving(false);
    }
  };

  // Single rule save from modal
  const handleSaveSingleRule = async () => {
    if (!ruleForm.category || !ruleForm.key || !ruleForm.label_ar) {
      toast.error("يرجى ملء جميع الحقول المطلوبة");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/game-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_rule",
          ...ruleForm,
        }),
      });
      if (!res.ok) throw new Error("Save rule failed");
      await queryClient.invalidateQueries({ queryKey: ["trade-rules"] });
      setIsModalOpen(false);
      toast.success(lang === "ar" ? "تم حفظ خيار المقايضة" : "Rule saved");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Delete rule
  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm(lang === "ar" ? "هل أنت متأكد من حذف هذا الخيار نهائياً؟" : "Delete this rule?")) {
      return;
    }
    try {
      const res = await fetch("/api/game-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_rule", id: ruleId }),
      });
      if (!res.ok) throw new Error("Delete failed");
      await queryClient.invalidateQueries({ queryKey: ["trade-rules"] });
      toast.success(lang === "ar" ? "تم حذف الخيار" : "Rule deleted");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const openNewRuleModal = (category = "box_presence") => {
    setEditingRule(null);
    setRuleForm({
      category,
      key: "",
      label_ar: "",
      label_en: "",
      percent: 0,
      sort_order: (grouped[category]?.length || 0) + 1,
      active: true,
    });
    setIsModalOpen(true);
  };

  const openEditRuleModal = (rule: TradeRule) => {
    setEditingRule(rule);
    const dp = draftPercentages[rule.id];
    const da = draftActive[rule.id];
    const currPct = dp !== undefined ? dp : Number(rule.percent);
    const currActive = da !== undefined ? da : rule.active === 1 || rule.active === true;

    setRuleForm({
      id: rule.id,
      category: rule.category,
      key: rule.key,
      label_ar: rule.label_ar,
      label_en: rule.label_en || "",
      percent: currPct,
      sort_order: rule.sort_order,
      active: currActive,
    });
    setIsModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="p-12 flex justify-center items-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-card border border-border p-5 rounded-2xl shadow-sm">
        <div>
          <h2 className="text-lg font-black text-foreground flex items-center gap-2.5">
            <SlidersHorizontal className="w-5 h-5 text-primary" />
            {lang === "ar"
              ? "التحكم بنسب وقواعد تقييم حالة المقايضة"
              : "Trade Condition Percentages"}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            {lang === "ar"
              ? "تحكم مباشرة بنسب الخصم أو الإضافة (+ / - %) لكل حالة (العلبة، الكارتريج، الملحقات، النسخة، وطريقة الدفع)."
              : "Directly adjust percentage modifiers (+/- %) for each condition category and live evaluate quotes."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleResetToDefault}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border hover:bg-muted text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {lang === "ar" ? "استعادة الافتراضي" : "Reset Defaults"}
          </button>

          <button
            type="button"
            onClick={() => openNewRuleModal()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-bold transition-colors border border-border"
          >
            <Plus className="w-4 h-4" />
            {lang === "ar" ? "إضافة خيار جديد" : "Add Condition Option"}
          </button>

          {hasChanges && (
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-md hover:opacity-90 transition-all animate-in fade-in"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {lang === "ar" ? "حفظ كافة النسب المعدلة" : "Save All Changes"}
            </button>
          )}

          <button
            type="button"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["trade-rules"] })}
            className="p-2 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground"
            title="تحديث"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Grid: Categories & Condition Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 8 cols: Category Condition Rules */}
        <div className="lg:col-span-8 space-y-6">
          {categories.map((cat) => {
            const catRules = rules.filter((r) => r.category === cat);
            return (
              <div
                key={cat}
                className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4"
              >
                {/* Category Header */}
                <div className="flex items-center justify-between pb-3 border-b border-border">
                  <div className="flex items-center gap-2.5">
                    <span className="w-3 h-3 rounded-full bg-primary" />
                    <h3 className="font-bold text-sm text-foreground">
                      {CATEGORY_LABEL_AR[cat] || cat}
                    </h3>
                    <span className="text-[11px] text-muted-foreground font-mono">({cat})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => openNewRuleModal(cat)}
                    className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {lang === "ar" ? "إضافة خيار لهذا القسم" : "Add Option"}
                  </button>
                </div>

                {/* Condition Rows */}
                <div className="space-y-2.5">
                  {catRules.map((rule) => {
                    const dp = draftPercentages[rule.id];
                    const da = draftActive[rule.id];
                    const currentPercent = dp !== undefined ? dp : Number(rule.percent);
                    const currentActive = da !== undefined ? da : rule.active === 1 || rule.active === true;
                    const isDrafted = dp !== undefined || da !== undefined;

                    return (
                      <div
                        key={rule.id}
                        className={`flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border transition-all ${
                          !currentActive
                            ? "bg-muted/20 border-dashed border-border opacity-60"
                            : isDrafted
                              ? "bg-primary/5 border-primary/30"
                              : "bg-background border-border hover:border-primary/20"
                        }`}
                      >
                        {/* Title & Key */}
                        <div className="flex-1 min-w-[180px]">
                          <div className="font-bold text-xs text-foreground flex items-center gap-2">
                            <span>{rule.label_ar}</span>
                            {rule.label_en && (
                              <span className="text-[10px] text-muted-foreground font-normal">
                                ({rule.label_en})
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                            المفتاح: <code className="text-primary">{rule.key}</code> • الترتيب:{" "}
                            {rule.sort_order}
                          </div>
                        </div>

                        {/* Interactive Direct Controls */}
                        <div className="flex items-center gap-3">
                          {/* Percentage Input + Badge */}
                          <div className="flex items-center gap-1.5 bg-card border border-border rounded-xl px-2 py-1 shadow-sm">
                            <span className="text-[11px] font-bold text-muted-foreground">
                              النسبة:
                            </span>
                            <input
                              type="number"
                              step="1"
                              value={currentPercent}
                              onChange={(e) =>
                                handlePercentChange(rule.id, Number(e.target.value) || 0)
                              }
                              className={`w-14 bg-transparent text-center font-black text-xs outline-none ${
                                currentPercent > 0
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : currentPercent < 0
                                    ? "text-rose-600 dark:text-rose-400"
                                    : "text-foreground"
                              }`}
                            />
                            <span className="text-xs font-bold text-muted-foreground">%</span>
                          </div>

                          {/* Quick Value Indicator Chip */}
                          <span
                            className={`min-w-[48px] text-center text-xs font-black px-2 py-1 rounded-lg ${
                              currentPercent > 0
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                : currentPercent < 0
                                  ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                                  : "bg-muted text-muted-foreground border border-border"
                            }`}
                          >
                            {currentPercent > 0 ? `+${currentPercent}%` : `${currentPercent}%`}
                          </span>

                          {/* Active Toggle Switch */}
                          <button
                            type="button"
                            onClick={() => handleActiveToggle(rule.id, currentActive)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${
                              currentActive
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                : "bg-muted text-muted-foreground border-border"
                            }`}
                          >
                            {currentActive ? "مفعل" : "معطل"}
                          </button>

                          {/* Edit Full Details */}
                          <button
                            type="button"
                            onClick={() => openEditRuleModal(rule)}
                            className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="تعديل تفاصيل الخيار"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete */}
                          <button
                            type="button"
                            onClick={() => handleDeleteRule(rule.id)}
                            className="p-1.5 rounded-lg border border-rose-500/20 hover:bg-rose-500/10 text-rose-500 transition-colors"
                            title="حذف الخيار"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right 4 cols: Live Quote Simulator */}
        <div className="lg:col-span-4 space-y-4">
          <div className="sticky top-6 bg-card border border-border rounded-2xl p-5 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                <Calculator className="w-4 h-4 text-amber-500" />
                {lang === "ar" ? "محاكي احتساب المقايضة الفوري" : "Live Quote Simulator"}
              </h3>
              <span className="text-[11px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                مباشر
              </span>
            </div>

            {/* Base Price input */}
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1.5">
                {lang === "ar" ? "السعر الأساسي للعبة (د.ع):" : "Base Trade Price (IQD):"}
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="1000"
                  value={simBasePrice}
                  onChange={(e) => setSimBasePrice(Number(e.target.value) || 0)}
                  className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 font-black text-sm text-foreground outline-none focus:border-primary"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-bold">
                  د.ع
                </span>
              </div>
            </div>

            {/* Category Choices in Simulator */}
            <div className="space-y-3 pt-1 border-t border-border">
              {categories.map((cat) => {
                const catRules = rules.filter(
                  (r) =>
                    r.category === cat &&
                    (draftActive[r.id] !== undefined
                      ? draftActive[r.id]
                      : r.active === 1 || r.active === true),
                );
                if (catRules.length === 0) return null;

                return (
                  <div key={cat}>
                    <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                      {CATEGORY_LABEL_AR[cat] || cat}:
                    </label>
                    <select
                      value={simSelections[cat] || catRules[0]?.key}
                      onChange={(e) =>
                        setSimSelections((prev) => ({ ...prev, [cat]: e.target.value }))
                      }
                      className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs font-bold text-foreground outline-none focus:border-primary"
                    >
                      {catRules.map((r) => {
                        const dp = draftPercentages[r.id];
                        const pct = dp !== undefined ? dp : Number(r.percent);
                        return (
                          <option key={r.key} value={r.key}>
                            {r.label_ar} ({pct > 0 ? `+${pct}%` : `${pct}%`})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                );
              })}
            </div>

            {/* Payout method choice in Simulator */}
            <div className="pt-2 border-t border-border">
              <label className="block text-[11px] font-bold text-muted-foreground mb-1.5">
                {lang === "ar" ? "طريقة استلام المقابل:" : "Payout Method:"}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSimPayout("store_credit")}
                  className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                    simPayout === "store_credit"
                      ? "bg-primary/10 border-primary text-primary"
                      : "bg-background border-border text-muted-foreground"
                  }`}
                >
                  💳 رصيد محفظة
                </button>
                <button
                  type="button"
                  onClick={() => setSimPayout("cash")}
                  className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                    simPayout === "cash"
                      ? "bg-primary/10 border-primary text-primary"
                      : "bg-background border-border text-muted-foreground"
                  }`}
                >
                  💵 نقداً
                </button>
              </div>
            </div>

            {/* Simulation Results Output */}
            <div className="bg-muted/40 rounded-2xl p-4 border border-border space-y-3">
              <div className="text-xs font-bold text-muted-foreground">تفاصيل الحسبة:</div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">السعر الأساسي:</span>
                  <span className="font-bold">{simBasePrice.toLocaleString()} د.ع</span>
                </div>

                {simulatedQuote.lines.map((ln, idx) => (
                  <div key={idx} className="flex justify-between items-center text-[11px]">
                    <span className="text-muted-foreground">
                      • {ln.label} ({ln.percent > 0 ? `+${ln.percent}%` : `${ln.percent}%`}):
                    </span>
                    <span
                      className={`font-mono font-bold ${
                        ln.amount_iqd > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : ln.amount_iqd < 0
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-muted-foreground"
                      }`}
                    >
                      {ln.amount_iqd > 0
                        ? `+${ln.amount_iqd.toLocaleString()} د.ع`
                        : `${ln.amount_iqd.toLocaleString()} د.ع`}
                    </span>
                  </div>
                ))}

                <div className="flex justify-between pt-1 border-t border-border/50">
                  <span className="text-muted-foreground">إجمالي نسبة التعديل:</span>
                  <span
                    className={`font-black ${
                      simulatedQuote.totalPercent > 0
                        ? "text-emerald-600"
                        : simulatedQuote.totalPercent < 0
                          ? "text-rose-600"
                          : "text-foreground"
                    }`}
                  >
                    {simulatedQuote.totalPercent > 0
                      ? `+${simulatedQuote.totalPercent}%`
                      : `${simulatedQuote.totalPercent}%`}
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-border flex justify-between items-center">
                <span className="font-bold text-xs text-foreground">القيمة النهائية المقدرة:</span>
                <span className="text-base font-black text-primary">
                  {simulatedQuote.finalIqd.toLocaleString()} د.ع
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add / Edit Rule Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-black text-base flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-primary" />
                {editingRule ? "تعديل خيار المقايضة" : "إضافة خيار مقايضة جديد"}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold mb-1">القسم (Category)</label>
                <select
                  value={ruleForm.category}
                  onChange={(e) => setRuleForm({ ...ruleForm, category: e.target.value })}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2.5 outline-none font-bold"
                >
                  {Object.entries(CATEGORY_LABEL_AR).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label} ({k})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold mb-1">مفتاح الخيار (Key - English)</label>
                  <input
                    value={ruleForm.key}
                    onChange={(e) => setRuleForm({ ...ruleForm, key: e.target.value })}
                    placeholder="e.g. mint_condition"
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">نسبة التعديل (Percent ±%)</label>
                  <input
                    type="number"
                    value={ruleForm.percent}
                    onChange={(e) => setRuleForm({ ...ruleForm, percent: Number(e.target.value) })}
                    placeholder="e.g. -15 or +10"
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 outline-none font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1">الاسم بالعربية</label>
                <input
                  value={ruleForm.label_ar}
                  onChange={(e) => setRuleForm({ ...ruleForm, label_ar: e.target.value })}
                  placeholder="مثلاً: حالة ممتازة مع القرطاس"
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 outline-none font-bold"
                />
              </div>

              <div>
                <label className="block font-bold mb-1">الاسم بالإنجليزية (اختياري)</label>
                <input
                  value={ruleForm.label_en}
                  onChange={(e) => setRuleForm({ ...ruleForm, label_en: e.target.value })}
                  placeholder="e.g. Mint with wrap"
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 items-center pt-1">
                <div>
                  <label className="block font-bold mb-1">ترتيب العرض (Sort Order)</label>
                  <input
                    type="number"
                    value={ruleForm.sort_order}
                    onChange={(e) =>
                      setRuleForm({ ...ruleForm, sort_order: Number(e.target.value) })
                    }
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 outline-none"
                  />
                </div>
                <div className="pt-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ruleForm.active}
                      onChange={(e) => setRuleForm({ ...ruleForm, active: e.target.checked })}
                      className="w-4 h-4 rounded text-primary"
                    />
                    <span className="font-bold">مفعل ويطبق بالحساب</span>
                  </label>
                </div>
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={handleSaveSingleRule}
                  disabled={saving || !ruleForm.key || !ruleForm.label_ar}
                  className="flex-1 py-2.5 bg-primary text-primary-foreground font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  حفظ الخيار
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 border border-border rounded-xl font-bold hover:bg-muted"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
