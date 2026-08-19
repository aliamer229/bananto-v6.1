import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles,
  TrendingUp,
  Package,
  Megaphone,
  Zap,
  Send,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Copy,
  Check,
  Bot,
  Lightbulb,
  ShoppingBag,
  Star,
  Layers,
  ChevronDown,
  ChevronUp,
  Flame,
} from "lucide-react";
import { safeStringify } from "@/utils/safeJson";
import { playSound } from "@/utils/audio";

interface ActionItem {
  label: string;
  tab: string;
  badge?: string;
}

interface AdvisorMessage {
  id: string;
  role: "user" | "advisor";
  text: string;
  summary?: string;
  actionableTips?: string[];
  suggestedActions?: ActionItem[];
  healthScore?: number;
  sentiment?: "positive" | "attention" | "opportunity" | "critical";
  timestamp: string;
}

const STRATEGY_MODES = [
  {
    id: "growth",
    label: "نمو المبيعات",
    icon: TrendingUp,
    color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
  },
  {
    id: "inventory",
    label: "المخزون والتسعير",
    icon: Package,
    color: "text-blue-500 bg-blue-500/10 border-blue-500/20",
  },
  {
    id: "marketing",
    label: "التسويق والإعلانات",
    icon: Megaphone,
    color: "text-purple-500 bg-purple-500/10 border-purple-500/20",
  },
  {
    id: "operations",
    label: "العمليات والتوصيل",
    icon: Zap,
    color: "text-amber-500 bg-amber-500/10 border-amber-500/20",
  },
  {
    id: "general",
    label: "استشارة عامة",
    icon: Sparkles,
    color: "text-primary bg-primary/10 border-primary/20",
  },
];

const PRESET_PROMPTS = [
  { label: "📊 تقرير فحص استراتيجي شامل للمتجر", mode: "general" },
  { label: "💡 كيف أزيد مبيعات الألعاب والأجهزة هذا الأسبوع؟", mode: "growth" },
  { label: "📦 تحليل نواقص المخزون واقتراح كميات التموين", mode: "inventory" },
  { label: "📣 اكتب نص إعلان ترويجي جذاب لوسائل التواصل", mode: "marketing" },
  { label: "⚡ خطة لتسريع دورة تجهيز وشحن الطلبات", mode: "operations" },
];

export function StoreAdvisorSection({
  orders = [],
  messages = [],
  products = [],
  categories = [],
  changeTab,
}: {
  orders: any[];
  messages: any[];
  products: any[];
  categories: any[];
  changeTab: (tab: string) => void;
}) {
  const [mode, setMode] = useState<string>("general");
  const [promptInput, setPromptInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [messagesHistory, setMessagesHistory] = useState<AdvisorMessage[]>([]);
  const [storeAudit, setStoreAudit] = useState<any | null>(null);
  const [isExpandedSummary, setIsExpandedSummary] = useState(true);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Initial audit load on mount
  useEffect(() => {
    fetch("/api/store-advisor")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.audit) {
          setStoreAudit(data.audit);
          // Set initial greeting message
          setMessagesHistory([
            {
              id: "init-1",
              role: "advisor",
              text: data.audit.reply,
              summary: data.audit.summary,
              actionableTips: data.audit.actionableTips,
              suggestedActions: data.audit.suggestedActions,
              healthScore: data.audit.healthScore,
              sentiment: data.audit.sentiment,
              timestamp: new Date().toLocaleTimeString("ar-IQ", {
                hour: "2-digit",
                minute: "2-digit",
              }),
            },
          ]);
        }
      })
      .catch(() => {
        // Fallback default
        const pendingOrders = orders.filter((o) => o.status === "pending" || !o.status).length;
        setMessagesHistory([
          {
            id: "init-default",
            role: "advisor",
            text: `أهلاً بك يا مدير! أنا مستشارك الذكي في متجر بنانتو.\n\nحالياً يوجد **${orders.length} طلبات** مسجلة و **${products.length} منتجات** في الكتالوج.\n\nكيف يمكنني مساعدتك اليوم في تحسين المبيعات، ضبط المخزون، أو صياغة الحملات الإعلانية؟`,
            actionableTips: [
              pendingOrders > 0
                ? `متابعة ${pendingOrders} طلبات جديدة معلقة`
                : "المخزون والطلبات بحالة ممتازة",
              "إضافة بنر ترويجي لتنشيط الصفحة الرئيسية",
              "تحديث أسعار وحزم الألعاب الأكثر طلباً",
            ],
            suggestedActions: [
              {
                label: "إدارة الطلبات",
                tab: "orders",
                badge: pendingOrders > 0 ? `${pendingOrders}` : undefined,
              },
              { label: "إدارة المنتجات", tab: "listings" },
              { label: "البنرات الإعلانية", tab: "banners" },
            ],
            healthScore: 90,
            sentiment: "positive",
            timestamp: new Date().toLocaleTimeString("ar-IQ", {
              hour: "2-digit",
              minute: "2-digit",
            }),
          },
        ]);
      });
  }, []);

  const handleSendMessage = async (textToSend?: string, selectedMode?: string) => {
    const text = (textToSend || promptInput).trim();
    if (!text || isLoading) return;

    playSound("send_message", 0.4);
    const activeMode = selectedMode || mode;

    const userMsg: AdvisorMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text,
      timestamp: new Date().toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" }),
    };

    setMessagesHistory((prev) => [...prev, userMsg]);
    if (!textToSend) setPromptInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/store-advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: safeStringify({
          prompt: text,
          mode: activeMode,
          history: messagesHistory.slice(-4).map((m) => ({
            role: m.role === "user" ? "user" : "assistant",
            text: m.text,
          })),
        }),
      });

      const data = await res.json();

      const advisorMsg: AdvisorMessage = {
        id: `adv-${Date.now()}`,
        role: "advisor",
        text: data.reply || "تمت معالجة الاستشارة بنجاح.",
        summary: data.summary,
        actionableTips: data.actionableTips,
        suggestedActions: data.suggestedActions,
        healthScore: data.healthScore,
        sentiment: data.sentiment,
        timestamp: new Date().toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" }),
      };

      setMessagesHistory((prev) => [...prev, advisorMsg]);
      playSound("receive_message", 0.5);
    } catch {
      const fallbackMsg: AdvisorMessage = {
        id: `adv-${Date.now()}`,
        role: "advisor",
        text: "نصيحة استراتيجية لمتجرك اليوم: ركز على سرعة الاستجابة لطلبات المشترين، وتأكد من توفير حزم ترويجية للألعاب الأكثر طلباً في السوق العراقي.",
        actionableTips: [
          "متابعة شحن الطلبات المعلقة فوراً",
          "إضافة عروض وبنرات ترويجية لألعاب الشهر",
          "تفعيل مكافآت نقاط الموز لجذب الزوار",
        ],
        suggestedActions: [
          { label: "إدارة الطلبات", tab: "orders" },
          { label: "إدارة المنتجات", tab: "listings" },
        ],
        healthScore: 85,
        sentiment: "positive",
        timestamp: new Date().toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" }),
      };
      setMessagesHistory((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Quick vital calculations
  const pendingOrdersCount = orders.filter((o) => o.status === "pending" || !o.status).length;
  const lowStockCount = products.filter(
    (p) => typeof p.stock === "number" && p.stock <= 2 && p.stock >= 0,
  ).length;
  const healthScore = storeAudit?.healthScore || 92;

  return (
    <div className="mb-10 rounded-3xl border border-border/80 bg-card/60 backdrop-blur-xl shadow-xl overflow-hidden text-card-foreground">
      {/* Top Banner Header */}
      <div className="relative overflow-hidden bg-gradient-to-r from-amber-500/10 via-primary/5 to-purple-500/10 p-6 sm:p-8 border-b border-border/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-500/25 ring-4 ring-amber-500/15">
              <Bot className="h-6 w-6" />
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-background" />
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-black tracking-tight font-serif text-foreground">
                  مستشار المتجر الذكي
                </h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  <Sparkles className="w-3 h-3" />
                  Gemini AI 3.7 • متصل حياً
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                تحليل استراتيجي وتوصيات فورية لزيادة المبيعات، ضبط المخزون، وصياغة الحملات
              </p>
            </div>
          </div>

          {/* Health Index Card */}
          <div className="flex items-center gap-4 bg-background/80 border border-border/80 rounded-2xl p-2.5 sm:px-4 shadow-sm">
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                مؤشر صحة المتجر
              </div>
              <div className="text-lg font-black flex items-center gap-1">
                <span className={healthScore >= 80 ? "text-emerald-500" : "text-amber-500"}>
                  {healthScore}%
                </span>
                <span className="text-[11px] font-semibold text-muted-foreground">
                  {healthScore >= 80 ? "أداء ممتاز" : "يحتاج تحسينات"}
                </span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <Flame className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Quick Vitals KPI Badges */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <button
            onClick={() => changeTab("orders")}
            className="flex items-center justify-between p-3 rounded-xl bg-background/60 hover:bg-background border border-border/60 hover:border-amber-500/40 transition-all text-right group"
          >
            <div>
              <div className="text-[11px] font-medium text-muted-foreground">الطلبات المعلقة</div>
              <div className="text-sm font-black text-foreground group-hover:text-amber-500 transition-colors">
                {pendingOrdersCount} طلبات
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </button>

          <button
            onClick={() => changeTab("listings")}
            className="flex items-center justify-between p-3 rounded-xl bg-background/60 hover:bg-background border border-border/60 hover:border-blue-500/40 transition-all text-right group"
          >
            <div>
              <div className="text-[11px] font-medium text-muted-foreground">مخزون منخفض</div>
              <div className="text-sm font-black text-foreground group-hover:text-blue-500 transition-colors">
                {lowStockCount} منتجات
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </button>

          <button
            onClick={() => changeTab("reviews")}
            className="flex items-center justify-between p-3 rounded-xl bg-background/60 hover:bg-background border border-border/60 hover:border-purple-500/40 transition-all text-right group"
          >
            <div>
              <div className="text-[11px] font-medium text-muted-foreground">تقييم الأعضاء</div>
              <div className="text-sm font-black text-foreground group-hover:text-purple-500 transition-colors">
                {storeAudit?.statsSnapshot?.avgRating || "5.0"} ★
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center">
              <Star className="w-4 h-4" />
            </div>
          </button>

          <button
            onClick={() => changeTab("banners")}
            className="flex items-center justify-between p-3 rounded-xl bg-background/60 hover:bg-background border border-border/60 hover:border-emerald-500/40 transition-all text-right group"
          >
            <div>
              <div className="text-[11px] font-medium text-muted-foreground">العروض والبنرات</div>
              <div className="text-sm font-black text-foreground group-hover:text-emerald-500 transition-colors">
                تنشيط الحملات
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <Megaphone className="w-4 h-4" />
            </div>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-4 sm:p-6 space-y-5">
        {/* Strategy Mode Switcher */}
        <div>
          <div className="text-xs font-bold text-muted-foreground mb-2 flex items-center justify-between">
            <span>اختر مجال الاستشارة:</span>
            <span className="text-[11px] text-foreground/50">
              يوجّه ذكاء المستشار حسب الأولويات
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {STRATEGY_MODES.map((m) => {
              const Icon = m.icon;
              const isSelected = mode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    setMode(m.id);
                    playSound("hover_s", 0.4);
                  }}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 border ${
                    isSelected
                      ? "bg-foreground text-background border-foreground shadow-sm scale-102"
                      : "bg-muted/40 text-muted-foreground border-border/60 hover:bg-muted"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick Suggestion Chips */}
        <div className="flex flex-wrap gap-1.5">
          {PRESET_PROMPTS.map((p, idx) => (
            <button
              key={idx}
              disabled={isLoading}
              onClick={() => handleSendMessage(p.label, p.mode)}
              className="text-[11px] font-medium bg-background hover:bg-muted border border-border/80 hover:border-foreground/30 px-3 py-1.5 rounded-full text-foreground/80 transition-all flex items-center gap-1 shadow-xs disabled:opacity-50"
            >
              <Lightbulb className="w-3 h-3 text-amber-500" />
              <span>{p.label}</span>
            </button>
          ))}
        </div>

        {/* Chat / Consultation Timeline */}
        <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1 no-scrollbar rounded-2xl bg-muted/20 p-3 sm:p-4 border border-border/40">
          <AnimatePresence initial={false}>
            {messagesHistory.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "advisor" && (
                  <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-1">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-[90%] sm:max-w-[85%] rounded-2xl p-4 text-xs sm:text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-foreground text-background font-semibold rounded-tl-sm"
                      : "bg-background border border-border shadow-sm rounded-tr-sm text-foreground space-y-3"
                  }`}
                >
                  {/* Advisor Response Rendering */}
                  {msg.role === "advisor" ? (
                    <div>
                      {/* Summary Banner if present */}
                      {msg.summary && (
                        <div className="mb-3 pb-2 border-b border-border/60 flex items-center justify-between">
                          <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5" />
                            {msg.summary}
                          </span>
                          <button
                            onClick={() => handleCopy(msg.id, msg.text)}
                            className="text-[11px] font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-0.5 rounded bg-muted/60"
                            title="نسخ التقرير"
                          >
                            {copiedId === msg.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-500" />
                                <span>تم النسخ</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>نسخ</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}

                      {/* Main Message Text */}
                      <div className="whitespace-pre-wrap font-sans text-foreground/90 leading-relaxed text-xs sm:text-sm">
                        {msg.text}
                      </div>

                      {/* Actionable Tips Checklist */}
                      {msg.actionableTips && msg.actionableTips.length > 0 && (
                        <div className="mt-3.5 pt-3 border-t border-border/60 space-y-2">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            خطوات عملية مقترحة للتنفيذ:
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {msg.actionableTips.map((tip, tIdx) => (
                              <div
                                key={tIdx}
                                className="flex items-start gap-1.5 p-2 rounded-lg bg-muted/40 border border-border/40 text-xs font-medium text-foreground/80"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 mt-1.5" />
                                <span>{tip}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Direct Navigation Actions */}
                      {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-border/60 flex flex-wrap gap-2 items-center">
                          <span className="text-[11px] font-bold text-muted-foreground">
                            إجراءات سريعة:
                          </span>
                          {msg.suggestedActions.map((act, aIdx) => (
                            <button
                              key={aIdx}
                              onClick={() => {
                                playSound("click", 0.4);
                                changeTab(act.tab);
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-foreground text-background hover:opacity-90 transition-opacity text-xs font-bold"
                            >
                              <span>{act.label}</span>
                              {act.badge && (
                                <span className="bg-amber-500 text-black px-1.5 py-0.2 rounded-full text-[10px] font-black">
                                  {act.badge}
                                </span>
                              )}
                              <ArrowRight className="w-3 h-3 rotate-180" />
                            </button>
                          ))}
                        </div>
                      )}

                      <div
                        className="text-[10px] text-muted-foreground/60 text-left mt-1"
                        dir="ltr"
                      >
                        {msg.timestamp}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div>{msg.text}</div>
                      <div className="text-[10px] text-background/70 text-left mt-1" dir="ltr">
                        {msg.timestamp}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Loading Indicator */}
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3"
            >
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-background border border-border p-3.5 rounded-2xl rounded-tr-sm flex items-center gap-2 text-xs font-semibold text-muted-foreground shadow-sm">
                <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
                <span>المستشار الذكي يحلل بيانات المتجر ويصيغ التوصيات…</span>
              </div>
            </motion.div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Input Bar */}
        <div className="relative flex items-center gap-2">
          <input
            type="text"
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSendMessage();
              }
            }}
            placeholder="اسأل مستشارك الذكي عن زيادة المبيعات، تسعير المنتجات، حملات ترويجية، أو استفسار مخصص..."
            className="flex-1 bg-background border border-border/80 focus:border-amber-500 rounded-2xl px-4 py-3 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all shadow-xs"
          />
          <button
            onClick={() => void handleSendMessage()}
            disabled={isLoading || !promptInput.trim()}
            className="px-4 sm:px-6 py-3 rounded-2xl bg-foreground text-background font-bold text-xs sm:text-sm flex items-center gap-2 hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shrink-0"
          >
            {isLoading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span>استشارة</span>
                <Send className="w-3.5 h-3.5 rotate-180" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
