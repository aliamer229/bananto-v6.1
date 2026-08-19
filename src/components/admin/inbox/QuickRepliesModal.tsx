import React, { useState, useMemo } from "react";
import { Zap, Search, X, Check, Send, Sparkles, ArrowRight } from "lucide-react";
import { DEFAULT_QUICK_REPLIES, QUICK_REPLIES_CATEGORIES } from "./QuickRepliesData";
import { QuickReply } from "./types";

interface QuickRepliesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectReply: (replyText: string, andSend?: boolean) => void;
}

export function QuickRepliesModal({ isOpen, onClose, onSelectReply }: QuickRepliesModalProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [hoveredReply, setHoveredReply] = useState<QuickReply | null>(null);

  const filteredReplies = useMemo(() => {
    return DEFAULT_QUICK_REPLIES.filter((reply) => {
      const matchesCategory = selectedCategory === "all" || reply.category === selectedCategory;
      const matchesSearch =
        reply.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        reply.text.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [searchTerm, selectedCategory]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[650px] max-h-[90vh]"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">الردود السريعة الجاهزة</h2>
              <p className="text-xs text-muted-foreground">
                قوالب احترافية للرد السريع على استفسارات وتجهيز الطلبات
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Categories Bar */}
        <div className="p-3 border-b border-border bg-card space-y-2.5">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="ابحث في نصوص وعناوين الردود السريعة..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pr-9 pl-4 py-2 bg-muted/40 border border-border rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-primary/20 text-foreground"
              autoFocus
            />
          </div>

          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {QUICK_REPLIES_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`whitespace-nowrap px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  selectedCategory === cat.id
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* List of Replies */}
        <div className="flex-1 overflow-y-auto p-3 divide-y divide-border/40">
          {filteredReplies.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-xs space-y-2">
              <Sparkles className="w-8 h-8 mx-auto text-muted-foreground/40" />
              <div>لا توجد ردود سريعة مطابقة لبحثك</div>
            </div>
          ) : (
            filteredReplies.map((reply) => (
              <div
                key={reply.id}
                onMouseEnter={() => setHoveredReply(reply)}
                className="py-3 px-2 rounded-xl hover:bg-muted/40 transition-colors group flex items-start justify-between gap-4"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-foreground group-hover:text-primary transition-colors">
                      {reply.title}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                      {QUICK_REPLIES_CATEGORIES.find((c) => c.id === reply.category)?.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{reply.text}</p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectReply(reply.text, false);
                      onClose();
                    }}
                    title="إدراج في مربع الكتابة"
                    className="px-2.5 py-1.5 text-[11px] font-semibold bg-muted hover:bg-muted-foreground/20 text-foreground rounded-lg transition-colors flex items-center gap-1"
                  >
                    إدراج
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectReply(reply.text, true);
                      onClose();
                    }}
                    title="إرسال مباشرة للعميل"
                    className="px-2.5 py-1.5 text-[11px] font-semibold bg-primary hover:opacity-90 text-primary-foreground rounded-lg transition-all flex items-center gap-1 shadow-xs"
                  >
                    <Send className="w-3 h-3" />
                    إرسال فوراً
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
          <span>إجمالي القوالب المتوفرة: {filteredReplies.length}</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-card border border-border rounded-xl text-xs font-semibold text-foreground hover:bg-muted transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
