/**
 * The full import schema as an editable form — for every section, not just
 * hardware.
 *
 * A template carries 150–300 fields. Rendering them as one flat form is the
 * reason the admin editor was unusable: everything was visible, nothing was
 * prioritised, and a charger asked for Hall-effect stick settings. So the form
 * is built from the same schema the parser and the product page read, and it
 * applies the schema's own metadata:
 *
 *  - **`group`** becomes a collapsible section, in schema order, so the form
 *    reads in the same order as the template file.
 *  - **`level`** drives a completion badge per section — complete, missing
 *    recommended fields, or purely optional — so an admin can see where the
 *    work is without opening all of them.
 *  - **`showFor` + the schema's `conditionalOn`** hide fields that do not apply
 *    to this product. A charger never shows controller fields, and a section
 *    whose every field was hidden is not rendered at all.
 *  - **`audience`** marks internal fields, so nobody fills a research note
 *    expecting a customer to read it.
 *
 * Repeated fields have no cap here either: "Add" appends, and the index is
 * whatever the array length happens to be.
 */

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Circle, Lock, Plus, TriangleAlert, Trash2 } from "lucide-react";

import { fieldApplies, fieldLevel, hasValue } from "@/lib/productImport/quality";
import type { FieldDef, ProductSchema } from "@/lib/productImport/types";

type Record_ = Record<string, any>;

function coerceInput(raw: string, type: FieldDef["type"]) {
  if (type === "number" || type === "integer") return raw === "" ? "" : Number(raw);
  if (type === "boolean") return raw === "" ? undefined : raw === "true";
  return raw;
}

function ScalarControl({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const label = field.description || field.key;
  const level = fieldLevel(field);
  const common =
    "w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
  return (
    <label className="block min-w-0">
      <span className="mb-1 flex flex-wrap items-center gap-1.5 text-xs font-bold">
        <span>{label}</span>
        {level === "required" ? <span className="text-red-500">*</span> : null}
        {level === "recommended" ? (
          <span className="rounded bg-amber-500/15 px-1 text-[9px] font-bold text-amber-600">
            موصى به
          </span>
        ) : null}
        {field.audience === "internal" ? (
          <span
            className="inline-flex items-center gap-0.5 rounded bg-muted px-1 text-[9px] text-muted-foreground"
            title="داخلي — لا يُعرض للعميل"
          >
            <Lock className="h-2.5 w-2.5" />
            داخلي
          </span>
        ) : null}
      </span>
      {field.type === "multiline" ? (
        <textarea
          rows={3}
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
          className={common}
        />
      ) : field.type === "boolean" ? (
        <select
          value={value === undefined || value === "" ? "" : value ? "true" : "false"}
          onChange={(event) => onChange(coerceInput(event.target.value, field.type))}
          className={common}
        >
          <option value="">غير محدد</option>
          <option value="true">نعم / مدعوم</option>
          <option value="false">لا / غير مدعوم</option>
        </select>
      ) : field.type === "enum" ? (
        <select
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
          className={common}
        >
          <option value="">—</option>
          {(field.enumValues || []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={
            field.type === "date"
              ? "date"
              : field.type === "number" || field.type === "integer"
                ? "number"
                : field.type === "url"
                  ? "url"
                  : "text"
          }
          value={String(value ?? "")}
          onChange={(event) => onChange(coerceInput(event.target.value, field.type))}
          placeholder={field.example}
          className={common}
        />
      )}
      {field.unit ? (
        <span className="mt-1 block text-[10px] text-muted-foreground">الوحدة: {field.unit}</span>
      ) : null}
    </label>
  );
}

function FieldControl({
  field,
  container,
  onChange,
}: {
  field: FieldDef;
  container: Record_;
  onChange: (next: Record_) => void;
}) {
  const current = container[field.target];
  const setCurrent = (next: unknown) => onChange({ ...container, [field.target]: next });

  if (field.repeatable) {
    const entries = Array.isArray(current) ? current : [];
    return (
      <div className="min-w-0 rounded-xl border border-border p-4 sm:col-span-2 xl:col-span-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h4 className="text-sm font-bold">{field.description || field.key}</h4>
            <p className="text-[10px] text-muted-foreground">بدون حد أقصى لعدد العناصر</p>
          </div>
          <button
            type="button"
            onClick={() => setCurrent([...entries, field.type === "group" ? {} : ""])}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold text-primary"
          >
            <Plus className="h-3.5 w-3.5" /> إضافة
          </button>
        </div>
        <div className="space-y-3">
          {entries.map((entry, index) => (
            <div key={index} className="min-w-0 rounded-xl bg-muted/30 p-3">
              <div className="mb-2 flex justify-between">
                <span className="text-[10px] font-bold text-muted-foreground" dir="ltr">
                  #{index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrent(entries.filter((_, itemIndex) => itemIndex !== index))}
                  className="text-red-500"
                  aria-label="حذف العنصر"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {field.type === "group" ? (
                <GroupFields
                  fields={Object.values(field.itemFields || {})}
                  container={entry && typeof entry === "object" ? entry : {}}
                  onChange={(next) =>
                    setCurrent(
                      entries.map((item, itemIndex) => (itemIndex === index ? next : item)),
                    )
                  }
                />
              ) : (
                <ScalarControl
                  field={{ ...field, repeatable: false, description: `عنصر ${index + 1}` }}
                  value={entry}
                  onChange={(next) =>
                    setCurrent(
                      entries.map((item, itemIndex) => (itemIndex === index ? next : item)),
                    )
                  }
                />
              )}
            </div>
          ))}
          {!entries.length ? (
            <p className="py-2 text-center text-xs text-muted-foreground">لا توجد عناصر بعد.</p>
          ) : null}
        </div>
      </div>
    );
  }

  if (field.type === "group") {
    const entry = current && typeof current === "object" ? current : {};
    return (
      <div className="min-w-0 rounded-xl border border-border p-4 sm:col-span-2 xl:col-span-3">
        <h4 className="mb-3 text-sm font-bold">{field.description || field.key}</h4>
        <GroupFields
          fields={Object.values(field.itemFields || {})}
          container={entry}
          onChange={setCurrent}
        />
      </div>
    );
  }

  return <ScalarControl field={field} value={current} onChange={setCurrent} />;
}

function GroupFields({
  fields,
  container,
  onChange,
}: {
  fields: FieldDef[];
  container: Record_;
  onChange: (next: Record_) => void;
}) {
  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {fields.map((field) => (
        <FieldControl key={field.key} field={field} container={container} onChange={onChange} />
      ))}
    </div>
  );
}

type Completeness = "complete" | "missing" | "optional";

/** What a collapsed section can say about itself without being opened. */
function sectionState(fields: FieldDef[], value: Record_): Completeness {
  let tracked = 0;
  let missing = 0;
  for (const field of fields) {
    const level = fieldLevel(field);
    if (level === "optional") continue;
    tracked++;
    if (!hasValue(value[field.target])) missing++;
  }
  if (tracked === 0) return "optional";
  return missing === 0 ? "complete" : "missing";
}

const STATE_META: Record<Completeness, { icon: typeof CheckCircle2; className: string; label: string }> =
  {
    complete: { icon: CheckCircle2, className: "text-emerald-500", label: "مكتمل" },
    missing: { icon: TriangleAlert, className: "text-amber-500", label: "ينقصه حقول موصى بها" },
    optional: { icon: Circle, className: "text-muted-foreground", label: "اختياري" },
  };

export function SchemaAdminEditor({
  schema,
  value,
  onChange,
  title,
}: {
  schema: ProductSchema;
  value: Record_;
  onChange: (next: Record_) => void;
  title?: string;
}) {
  const [open, setOpen] = useState<string | null>(null);

  /*
    Grouping is recomputed against the current record because it is
    conditional: changing `accessory_type` from controller to charger has to
    remove the controller block, not merely grey it out.
  */
  const groups = useMemo(() => {
    const map = new Map<string, FieldDef[]>();
    for (const field of schema.fields) {
      if (field.key === "schema_version") continue;
      if (!fieldApplies(field, schema, value)) continue;
      const name = field.group || "أخرى";
      const bucket = map.get(name);
      if (bucket) bucket.push(field);
      else map.set(name, [field]);
    }
    return [...map.entries()];
  }, [schema, value]);

  const activeGroup = open ?? groups[0]?.[0] ?? null;

  return (
    <section className="min-w-0 rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
        <div className="min-w-0">
          <h2 className="font-bold">{title ?? `محرر ${schema.label}`}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            كل حقول قالب الاستيراد قابلة للتحرير — الحقول المتكررة بلا حد أقصى، والحقول غير المتعلقة
            بنوع المنتج مخفية.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-[11px] font-bold" dir="ltr">
          v{schema.version}
        </span>
      </div>

      <div className="divide-y divide-border">
        {groups.map(([name, fields]) => {
          const state = sectionState(fields, value);
          const meta = STATE_META[state];
          const Icon = meta.icon;
          const isOpen = activeGroup === name;
          return (
            <div key={name} className="min-w-0">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? "" : name)}
                aria-expanded={isOpen}
                className="flex w-full min-w-0 items-center justify-between gap-3 px-5 py-3 text-start transition hover:bg-muted/40"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Icon className={`h-4 w-4 shrink-0 ${meta.className}`} />
                  <span className="truncate text-sm font-bold">{name}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground" dir="ltr">
                    {fields.length}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={`text-[11px] font-bold ${meta.className}`}>{meta.label}</span>
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </span>
              </button>
              {isOpen ? (
                <div className="px-5 pb-5">
                  <GroupFields fields={fields} container={value} onChange={onChange} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
