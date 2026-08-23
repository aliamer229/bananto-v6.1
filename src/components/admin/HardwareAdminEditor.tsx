import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Plus, Save, Trash2 } from "lucide-react";

import { HARDWARE_SCHEMA } from "@/lib/productImport/hardwareSchema";
import type { FieldDef } from "@/lib/productImport/types";

type Record_ = Record<string, any>;

const TABS = [
  "Basic",
  "Hardware",
  "Display",
  "Performance Capabilities",
  "Connectivity",
  "Power",
  "Dimensions",
  "Compatibility",
  "Box Contents",
  "Media",
  "Support",
  "SEO",
  "Advanced",
] as const;
type Tab = (typeof TABS)[number];

function tabFor(field: FieldDef): Tab {
  const group = field.group || "";
  if (
    field.key === "gaming_capability" ||
    field.key.startsWith("handheld_") ||
    field.key.startsWith("tv_") ||
    field.key.startsWith("supported_output") ||
    field.key.startsWith("supported_frame")
  )
    return "Performance Capabilities";
  if (
    /الشاشة|graphics/i.test(group) ||
    [
      "display_size",
      "display_type",
      "native_resolution",
      "panel_type",
      "refresh_rate",
      "hdr",
      "vrr",
    ].includes(field.key)
  )
    return "Display";
  if (/الاتصال|المنافذ/.test(group)) return "Connectivity";
  if (/الطاقة|البطارية/.test(group)) return "Power";
  if (/الأبعاد|الوزن/.test(group)) return "Dimensions";
  if (/التوافق/.test(group)) return "Compatibility";
  if (/محتويات العلبة/.test(group)) return "Box Contents";
  if (/الصور|الوسائط/.test(group)) return "Media";
  if (/الضمان|الدعم|التحديثات|المتطلبات/.test(group) || field.key === "document") return "Support";
  if (/محركات البحث/.test(group)) return "SEO";
  if (/الأساسيات|الوصف/.test(group)) return "Basic";
  if (/الأداء|مواصفات الجهاز/.test(group)) return "Hardware";
  return "Advanced";
}

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
  const common =
    "w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-bold">
        {label} {field.required ? <span className="text-red-500">*</span> : null}
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
          <option value="">Not Published</option>
          <option value="true">Yes / Supported</option>
          <option value="false">No / Not Supported</option>
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
        <span className="mt-1 block text-[10px] text-muted-foreground">Unit: {field.unit}</span>
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
          <div>
            <h4 className="text-sm font-bold">{field.description || field.key}</h4>
            <p className="text-[10px] text-muted-foreground">Unlimited entries supported</p>
          </div>
          <button
            type="button"
            onClick={() => setCurrent([...entries, field.type === "group" ? {} : ""])}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold text-primary"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
        <div className="space-y-3">
          {entries.map((entry, index) => (
            <div key={index} className="rounded-xl bg-muted/30 p-3">
              <div className="mb-2 flex justify-between">
                <span className="text-[10px] font-bold text-muted-foreground">#{index + 1}</span>
                <button
                  type="button"
                  onClick={() => setCurrent(entries.filter((_, itemIndex) => itemIndex !== index))}
                  className="text-red-500"
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
                  field={{ ...field, repeatable: false, description: `Entry ${index + 1}` }}
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
            <p className="py-2 text-center text-xs text-muted-foreground">No entries yet.</p>
          ) : null}
        </div>
      </div>
    );
  }

  if (field.type === "group") {
    const entry = current && typeof current === "object" ? current : {};
    return (
      <div className="rounded-xl border border-border p-4 sm:col-span-2 xl:col-span-3">
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

export function HardwareAdminEditor({
  value,
  onChange,
}: {
  value: Record_;
  onChange: (next: Record_) => void;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("Basic");
  const [draftState, setDraftState] = useState<"saving" | "saved" | "unsaved">("saved");
  const grouped = useMemo(() => {
    const map = new Map<Tab, FieldDef[]>(TABS.map((tab) => [tab, []]));
    for (const field of HARDWARE_SCHEMA.fields) map.get(tabFor(field))?.push(field);
    return map;
  }, []);

  useEffect(() => {
    setDraftState("unsaved");
    const timer = window.setTimeout(() => {
      setDraftState("saving");
      try {
        window.localStorage.setItem(
          `hardware-draft:${String(value.id || "new")}`,
          JSON.stringify(value),
        );
        setDraftState("saved");
      } catch {
        setDraftState("unsaved");
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [value]);

  return (
    <section className="rounded-xl border border-blue-500/25 bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
        <div>
          <h2 className="font-bold">Hardware Encyclopedia Editor</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Every import-schema field is editable; repeated groups have no fixed limit.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-[11px] font-bold">
          {draftState === "saved" ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          {draftState === "saved"
            ? "Saved"
            : draftState === "saving"
              ? "Saving…"
              : "Unsaved changes"}
        </span>
      </div>
      <div className="overflow-x-auto border-b border-border px-3">
        <div className="flex min-w-max gap-1 py-2">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${activeTab === tab ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>
      <div className="p-5">
        <GroupFields fields={grouped.get(activeTab) || []} container={value} onChange={onChange} />
      </div>
    </section>
  );
}
