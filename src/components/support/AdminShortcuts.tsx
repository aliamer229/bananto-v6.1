import React from "react";
import {
  Key,
  FileText,
  Lock,
  CheckCircle,
  Clock,
  UserCheck,
  Send,
  MoreHorizontal,
} from "lucide-react";

interface AdminShortcutsProps {
  onAction: (kind: string, payload?: any) => void;
  threadMode?: string;
}

export function AdminShortcuts({ onAction, threadMode }: AdminShortcutsProps) {
  return (
    <div className="flex flex-wrap gap-2 p-3 bg-muted/30 rounded-xl border border-border mb-4">
      <button
        onClick={() => onAction("item_credentials")}
        className="flex items-center gap-2 px-3 py-1.5 bg-background border border-border rounded-lg text-xs font-bold hover:bg-accent transition-colors"
      >
        <Key className="w-3.5 h-3.5" />
        تجهيز بيانات الحساب
      </button>

      <button
        onClick={() => onAction("instructions")}
        className="flex items-center gap-2 px-3 py-1.5 bg-background border border-border rounded-lg text-xs font-bold hover:bg-accent transition-colors"
      >
        <FileText className="w-3.5 h-3.5" />
        إرسال تعليمات
      </button>

      <button
        onClick={() => onAction("item_verification_code")}
        className="flex items-center gap-2 px-3 py-1.5 bg-background border border-border rounded-lg text-xs font-bold hover:bg-accent transition-colors"
      >
        <Lock className="w-3.5 h-3.5" />
        كود التحقق
      </button>

      <div className="h-6 w-px bg-border mx-1" />

      <button
        onClick={() => onAction("set_mode", { mode: "ORDER_PREPARATION" })}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
          threadMode === "ORDER_PREPARATION"
            ? "bg-amber-100 text-amber-700 border border-amber-200"
            : "bg-background border border-border hover:bg-accent"
        }`}
      >
        <Clock className="w-3.5 h-3.5" />
        تجهيز الطلب
      </button>

      <button
        onClick={() => onAction("set_mode", { mode: "RESOLVED" })}
        className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold hover:bg-emerald-100 transition-colors"
      >
        <CheckCircle className="w-3.5 h-3.5" />
        إغلاق التذكرة
      </button>
    </div>
  );
}
