/**
 * Admin editor for every hub field, generated from `HUB_GROUPS`.
 *
 * The product page reads the same schema, so adding a field there makes it
 * editable here and visible on the page without touching either renderer.
 */

import { Image as ImageIcon, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { HUB_GROUPS, type FieldDef } from "@/lib/hub-schema";
import { cn } from "@/lib/utils";

type Form = Record<string, any>;

async function uploadImage(file: File): Promise<string> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body });
  const json = (await res.json().catch(() => ({}))) as { url?: string };
  return json.url ?? "";
}

export default function HubFields({
  formData,
  onChange,
}: {
  formData: Form;
  onChange: (field: string, value: unknown) => void;
}) {
  const [active, setActive] = useState(HUB_GROUPS[0]?.id ?? "");
  const group = HUB_GROUPS.find((g) => g.id === active) ?? HUB_GROUPS[0];

  return (
    <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4">
      <div className="border-b pb-2 mb-2">
        <h2 className="text-lg font-bold">تفاصيل صفحة اللعبة</h2>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {HUB_GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setActive(g.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-bold transition-colors",
              g.id === active
                ? "bg-black text-white"
                : "bg-muted text-muted-foreground hover:bg-border",
            )}
          >
            {g.label}
          </button>
        ))}
      </div>

      {group ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {group.fields.map((field) => (
            <div
              key={field.key}
              className={field.wide || field.type === "list" ? "md:col-span-2" : ""}
            >
              <Field
                field={field}
                value={formData[field.key]}
                onChange={(v) => onChange(field.key, v)}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Label({ field }: { field: FieldDef }) {
  return (
    <label className="block text-[13px] text-muted-foreground mb-1.5 flex items-center justify-between">
      <span>{field.label}</span>
      {field.hint ? (
        <span className="text-[11px] text-muted-foreground/70 font-normal"> — {field.hint}</span>
      ) : null}
    </label>
  );
}

const inputClass =
  "w-full border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-black bg-card";

function Field({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (field.type === "bool") {
    return (
      <label className="flex items-center gap-2 bg-muted border border-border rounded-lg px-3 py-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4"
        />
        <span className="text-sm font-semibold">{field.label}</span>
      </label>
    );
  }

  if (field.type === "list") {
    if (!field.itemFields || field.itemFields.length === 0) {
      const items: string[] = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="space-y-3">
          <Label field={field} />
          {items.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                value={row || ""}
                onChange={(e) => onChange(items.map((v, i) => (i === index ? e.target.value : v)))}
                className={inputClass}
                placeholder={field.label}
              />
              <button
                type="button"
                onClick={() => onChange(items.filter((_, i) => i !== index))}
                className="p-2 text-muted-foreground hover:text-red-500 bg-card rounded-lg border border-border"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange([...items, ""])}
            className="text-sm text-blue-600 font-medium flex items-center gap-1 hover:underline"
          >
            <Plus className="w-4 h-4" /> إضافة عنصر
          </button>
        </div>
      );
    }

    const items: Form[] = Array.isArray(value) ? (value as Form[]) : [];
    const itemFields = field.itemFields;
    const patch = (index: number, key: string, v: unknown) =>
      onChange(items.map((row, i) => (i === index ? { ...row, [key]: v } : row)));
    return (
      <div className="space-y-3">
        <Label field={field} />
        {items.map((row, index) => (
          <div key={index} className="rounded-lg border border-border bg-muted p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted-foreground">#{index + 1}</span>
              <button
                type="button"
                onClick={() => onChange(items.filter((_, i) => i !== index))}
                className="p-1.5 text-muted-foreground hover:text-red-500 bg-card rounded-lg border border-border"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {itemFields.map((sub) => (
                <div
                  key={sub.key}
                  className={sub.type === "textarea" || sub.type === "image" ? "md:col-span-2" : ""}
                >
                  <Field
                    field={sub}
                    value={row[sub.key]}
                    onChange={(v) => patch(index, sub.key, v)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...items, {}])}
          className="text-sm text-blue-600 font-medium flex items-center gap-1 hover:underline"
        >
          <Plus className="w-4 h-4" /> إضافة عنصر
        </button>
      </div>
    );
  }

  if (field.type === "image") {
    const url = typeof value === "string" ? value : "";
    return (
      <div>
        <Label field={field} />
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-muted p-3 rounded-lg border border-border">
          {url ? (
            <img
              src={url}
              alt=""
              className="w-12 h-12 object-cover rounded border border-border shrink-0"
            />
          ) : (
            <div className="w-12 h-12 bg-muted rounded flex items-center justify-center border border-border shrink-0">
              <ImageIcon className="w-5 h-5 text-muted-foreground" />
            </div>
          )}
          <input
            dir="ltr"
            placeholder="رابط الصورة (http...)"
            className={inputClass}
            value={url}
            onChange={(e) => onChange(e.target.value)}
          />
          <input
            type="file"
            accept="image/*"
            className="text-xs text-muted-foreground file:py-1.5 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-black file:text-white cursor-pointer"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const uploaded = await uploadImage(file);
              if (uploaded) onChange(uploaded);
            }}
          />
        </div>
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div>
        <Label field={field} />
        <select
          className={inputClass}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">—</option>
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div>
        <Label field={field} />
        <textarea
          rows={4}
          className={inputClass}
          placeholder={field.placeholder ?? ""}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  return (
    <div>
      <Label field={field} />
      <input
        type={field.type === "number" ? "number" : "text"}
        dir={field.type === "url" ? "ltr" : undefined}
        className={inputClass}
        placeholder={field.placeholder ?? ""}
        value={value === undefined || value === null ? "" : String(value)}
        onChange={(e) =>
          onChange(
            field.type === "number"
              ? e.target.value === ""
                ? ""
                : Number(e.target.value)
              : e.target.value,
          )
        }
      />
    </div>
  );
}
