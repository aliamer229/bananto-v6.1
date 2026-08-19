/**
 * Ordered-step editor used by instruction fields (how to redeem, setup guide…).
 *
 * The stored value stays a plain string array so imports and the details page
 * can share it; this component only handles adding, editing, reordering and
 * removing lines.
 */

import { ArrowDown, ArrowUp, GripVertical, Plus, X } from "lucide-react";

export function StepsEditor({
  steps,
  onChange,
  placeholder = "اكتب الخطوة…",
  addLabel = "إضافة خطوة",
}: {
  steps: string[];
  onChange: (steps: string[]) => void;
  placeholder?: string;
  addLabel?: string;
}) {
  const update = (index: number, value: string) =>
    onChange(steps.map((step, i) => (i === index ? value : step)));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved ?? "");
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {steps.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          لا توجد خطوات بعد — أضف الخطوة الأولى أو استوردها من القالب.
        </p>
      )}

      {steps.map((step, index) => (
        <div key={index} className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold">
            {index + 1}
          </span>
          <GripVertical className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
          <input
            type="text"
            className="w-full border border-border focus:border-foreground rounded-lg px-3 py-2 text-sm outline-none bg-background"
            value={step}
            placeholder={placeholder}
            onChange={(e) => update(index, e.target.value)}
          />
          <button
            type="button"
            onClick={() => move(index, -1)}
            disabled={index === 0}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30"
            aria-label="أعلى"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => move(index, 1)}
            disabled={index === steps.length - 1}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30"
            aria-label="أسفل"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onChange(steps.filter((_, i) => i !== index))}
            className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10"
            aria-label="حذف"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...steps, ""])}
        className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-[11px] font-bold hover:bg-muted/80"
      >
        <Plus className="h-3.5 w-3.5" />
        {addLabel}
      </button>
    </div>
  );
}

export default StepsEditor;
