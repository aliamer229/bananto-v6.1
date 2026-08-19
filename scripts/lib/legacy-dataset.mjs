/**
 * Shared legacy dataset reader + D1 SQL builder.
 *
 * Reads the official `bananto_v4_legacy_*` archive (ZIP or extracted folder)
 * and turns it into real INSERT statements for the legacy_* staging tables.
 *
 * Nothing here invents numbers: every count comes from the parsed rows.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import AdmZip from "adm-zip";

export const JSONL_FILES = [
  { key: "legacy_users", path: "data/legacy_users.jsonl" },
  { key: "banana_transactions", path: "data/banana_transactions.jsonl" },
  { key: "orders", path: "data/orders.jsonl" },
  { key: "order_items", path: "data/order_items.jsonl" },
  { key: "threads", path: "data/threads.jsonl" },
  { key: "messages", path: "data/messages.jsonl" },
  { key: "reviews", path: "data/reviews.jsonl" },
  { key: "review_images", path: "data/review_images.jsonl" },
  { key: "media_manifest", path: "data/media_manifest.jsonl" },
  { key: "account_delivery_cards", path: "data/account_delivery_cards.jsonl" },
];

function parseJsonl(text, label) {
  const out = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      out.push(JSON.parse(line));
    } catch (err) {
      throw new Error(`INVALID_JSONL: ${label} line ${i + 1}: ${err.message}`);
    }
  }
  return out;
}

/** Reads the archive (zip file or extracted directory). */
export function readArchive(archivePath) {
  const abs = resolve(archivePath);
  if (!existsSync(abs)) throw new Error(`ARCHIVE_NOT_FOUND: ${abs}`);

  const isDir = statSync(abs).isDirectory();
  const readFile = isDir
    ? (rel) => {
        const p = join(abs, rel);
        return existsSync(p) ? readFileSync(p, "utf8") : null;
      }
    : (() => {
        const zip = new AdmZip(abs);
        const entries = zip.getEntries();
        return (rel) => {
          const entry = entries.find((e) => e.entryName === rel);
          return entry ? entry.getData().toString("utf8") : null;
        };
      })();

  const manifestRaw = readFile("manifest.json");
  if (!manifestRaw) throw new Error("MANIFEST_MISSING: manifest.json not found in archive");

  const data = {};
  const counts = {};
  const missing = [];
  for (const { key, path } of JSONL_FILES) {
    const raw = readFile(path);
    if (raw == null) {
      missing.push(path);
      data[key] = [];
      counts[key] = 0;
      continue;
    }
    data[key] = parseJsonl(raw, path);
    counts[key] = data[key].length;
  }

  const bananaTotal = data.legacy_users.reduce(
    (sum, u) => sum + (Number(u?.balances?.banana_balance ?? u?.banana_balance ?? 0) || 0),
    0,
  );

  return {
    manifest: JSON.parse(manifestRaw),
    data,
    counts,
    missing,
    bananaTotal,
    source: abs,
    isDir,
  };
}

/* ---------------------------------- SQL ---------------------------------- */

const sqlText = (value) => {
  if (value === null || value === undefined) return "NULL";
  const s = String(value).replace(/\u0000/g, "");
  return `'${s.replace(/'/g, "''")}'`;
};
const sqlInt = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
};
const sqlNum = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const sqlJson = (value) => sqlText(JSON.stringify(value ?? null));
const bool = (v) => (v ? 1 : 0);

function insert(table, columns, values) {
  return `INSERT OR REPLACE INTO ${table} (${columns.join(", ")}) VALUES (${values.join(", ")});`;
}

/**
 * Builds every INSERT statement, grouped per table.
 * @returns {{ table: string, statements: string[] }[]}
 */
export function buildStatements(dataset, options = {}) {
  const { data } = dataset;
  const groups = [];
  const mediaById = new Map(data.media_manifest.map((m) => [m.media_id, m]));

  const storageOf = (m) => {
    const intent = m?.v4_target_storage || m?.recommended_target_storage || m?.visibility_intent;
    return intent === "private" ? "BANANTO_PRIVATE_BUCKET" : "BANANTO_BUCKET";
  };
  const keyOf = (m) => m?.v4_target_key || m?.recommended_target_key || "";

  /* legacy_users */
  groups.push({
    table: "legacy_users",
    statements: data.legacy_users.map((u) => {
      const id = u.legacy_user_id;
      const identity = u.identity || {};
      const balances = u.balances || {};
      return insert(
        "legacy_users",
        [
          "id",
          "legacy_id",
          "name",
          "username",
          "email",
          "normalized_email",
          "phone",
          "normalized_phone",
          "banana_balance",
          "store_credit_iqd",
          "claim_state",
          "claimed_by_user_id",
          "claimed_at",
          "legacy_created_at",
          "raw_json",
        ],
        [
          sqlText(`lgu_${id}`),
          sqlText(id),
          sqlText(identity.display_name || ""),
          sqlText(identity.legacy_username),
          sqlText(identity.email),
          sqlText(identity.normalized_email),
          sqlText(identity.phone),
          sqlText(identity.normalized_phone),
          sqlInt(balances.banana_balance),
          sqlInt(balances.store_credit_iqd),
          sqlText(u.claim_state || "unclaimed"),
          sqlText(u.claimed_by_user_id),
          sqlText(u.claimed_at),
          sqlText(u.created_at),
          sqlJson(u),
        ],
      );
    }),
  });

  /* legacy_banana_transactions (history only, never re-awarded) */
  groups.push({
    table: "legacy_banana_transactions",
    statements: data.banana_transactions.map((t) => {
      const id = t.legacy_transaction_id;
      return insert(
        "legacy_banana_transactions",
        [
          "id",
          "legacy_id",
          "legacy_user_id",
          "amount",
          "balance_after",
          "reason",
          "type",
          "created_at",
          "raw_json",
        ],
        [
          sqlText(`lgbt_${id}`),
          sqlText(id),
          sqlText(t.user_legacy_id),
          sqlInt(t.amount),
          sqlInt(t.balance_after),
          sqlText(t.reason),
          sqlText(t.type),
          sqlText(t.created_at),
          sqlJson(t),
        ],
      );
    }),
  });

  /* legacy_orders */
  groups.push({
    table: "legacy_orders",
    statements: data.orders.map((o) => {
      const id = o.legacy_order_id;
      const currency = String(o.target_currency || "IQD").toUpperCase();
      return insert(
        "legacy_orders",
        [
          "id",
          "legacy_id",
          "legacy_user_id",
          "claimed_by_user_id",
          "order_no",
          "status",
          "legacy_original_status",
          "migration_archive",
          "total_iqd",
          "total_usd",
          "payment_method",
          "created_at",
          "raw_json",
        ],
        [
          sqlText(o.target_order_id || `legacy_ord_${id}`),
          sqlText(id),
          sqlText(o.legacy_user_id),
          sqlText(o.target_user_id),
          sqlText(o.target_code),
          sqlText(o.target_status || "completed"),
          sqlText(o.target_status),
          1,
          currency === "IQD" ? sqlInt(o.target_total) : 0,
          currency === "USD" ? sqlNum(o.target_total) : 0,
          sqlText(o.target_payment_status),
          sqlText(o.created_at),
          sqlJson(o),
        ],
      );
    }),
  });

  /* legacy_order_items */
  groups.push({
    table: "legacy_order_items",
    statements: data.order_items.map((it) => {
      const pr = it.product_resolution || {};
      return insert(
        "legacy_order_items",
        [
          "id",
          "legacy_order_id",
          "product_id",
          "product_name",
          "platform",
          "unit_price",
          "quantity",
          "kind",
          "raw_json",
        ],
        [
          sqlText(it.target_item_id || `legacy_itm_${it.legacy_item_id}`),
          sqlText(it.legacy_order_id),
          sqlText(pr.target_product_id || pr.legacy_product_id),
          sqlText(it.target_title || pr.product_name || ""),
          sqlText(pr.platform),
          sqlNum(it.unit_price),
          sqlInt(it.quantity, 1),
          sqlText(it.target_kind_suggestion || "account"),
          sqlJson(it),
        ],
      );
    }),
  });

  /* legacy_threads (imported closed + resolved so the live inbox stays clean) */
  groups.push({
    table: "legacy_threads",
    statements: data.threads.map((t) => {
      const id = t.legacy_thread_id;
      return insert(
        "legacy_threads",
        [
          "id",
          "legacy_id",
          "legacy_user_id",
          "claimed_by_user_id",
          "subject",
          "order_id",
          "status",
          "mode",
          "ai_paused",
          "needs_admin",
          "migration_archive",
          "legacy_original_status",
          "created_at",
          "raw_json",
        ],
        [
          sqlText(t.target_thread_id || `legacy_thr_${id}`),
          sqlText(id),
          sqlText(t.legacy_user_id),
          sqlText(t.target_user_id),
          sqlText(t.target_subject),
          sqlText(t.legacy_order_id),
          sqlText(t.target_status || "closed"),
          sqlText(t.target_mode || "RESOLVED"),
          bool(t.target_ai_paused ?? true),
          bool(t.target_needs_admin),
          bool(t.migration_archive ?? true),
          sqlText(t.legacy_original_status),
          sqlText(t.created_at),
          sqlJson(t),
        ],
      );
    }),
  });

  /* legacy_messages (structured card bodies preserved verbatim) */
  groups.push({
    table: "legacy_messages",
    statements: data.messages.map((m) => {
      const id = m.legacy_message_id;
      return insert(
        "legacy_messages",
        [
          "id",
          "legacy_thread_id",
          "sender_role",
          "sender_name",
          "kind",
          "body",
          "data_json",
          "created_at",
          "raw_json",
        ],
        [
          sqlText(m.target_id || `legacy_msg_${id}`),
          sqlText(m.legacy_thread_id),
          sqlText(m.target_sender_role || "assistant"),
          sqlText(m.target_sender_name || ""),
          sqlText(m.target_kind || "text"),
          sqlJson(m.target_body ?? {}),
          sqlJson(m.target_body ?? {}),
          sqlText(m.created_at),
          sqlJson(m),
        ],
      );
    }),
  });

  /* legacy_reviews */
  groups.push({
    table: "legacy_reviews",
    statements: data.reviews.map((r) => {
      const pr = r.product_resolution || {};
      const approved = String(r.status || "approved") === "approved";
      return insert(
        "legacy_reviews",
        [
          "id",
          "legacy_id",
          "legacy_user_id",
          "claimed_by_user_id",
          "product_id",
          "legacy_game_id",
          "legacy_game_name",
          "slug",
          "platform",
          "rating",
          "comment",
          "status",
          "is_approved",
          "unresolved",
          "matched_game_id",
          "matched_method",
          "created_at",
          "raw_json",
        ],
        [
          sqlText(r.target_review_id || `legacy_rev_${r.legacy_review_id}`),
          sqlText(r.legacy_review_id),
          sqlText(r.legacy_user_id),
          sqlText(r.target_user_id_after_claim),
          sqlText(pr.target_product_id),
          sqlText(pr.legacy_game_id),
          sqlText(pr.game_name),
          sqlText(pr.slug),
          sqlText(pr.platform),
          sqlInt(r.rating, 5),
          sqlText(r.comment),
          sqlText(r.status || "approved"),
          bool(approved),
          bool(!pr.target_product_id),
          sqlText(pr.target_product_id),
          sqlText(pr.target_product_id ? "exact_current_id" : null),
          sqlText(r.created_at),
          sqlJson(r),
        ],
      );
    }),
  });

  /* legacy_review_images (instagram proof always stays private) */
  groups.push({
    table: "legacy_review_images",
    statements: data.review_images.map((img) => {
      const media = mediaById.get(img.media_id);
      const isPrivate =
        img.role !== "product_photo" || storageOf(media) === "BANANTO_PRIVATE_BUCKET";
      return insert(
        "legacy_review_images",
        [
          "id",
          "legacy_review_id",
          "image_url",
          "role",
          "is_private",
          "r2_storage",
          "r2_key",
          "raw_json",
        ],
        [
          sqlText(`lgri_${img.legacy_review_id}_${sqlInt(img.position)}`),
          sqlText(img.legacy_review_id),
          sqlText(img.source_url),
          sqlText(img.role || "product_photo"),
          bool(isPrivate),
          sqlText(isPrivate ? "BANANTO_PRIVATE_BUCKET" : "BANANTO_BUCKET"),
          sqlText(keyOf(media)),
          sqlJson(img),
        ],
      );
    }),
  });

  /* legacy_media — references only: R2 keys + owner + access policy, no uploads */
  groups.push({
    table: "legacy_media",
    statements: data.media_manifest.map((m) => {
      const refs = Array.isArray(m.references) ? m.references : [];
      const owner = refs.find((r) => r && r.user_legacy_id)?.user_legacy_id ?? null;
      const role =
        refs.find((r) => r && (r.role || r.field))?.role ||
        refs.find((r) => r && r.field)?.field ||
        "product_photo";
      const storage = storageOf(m);
      return insert(
        "legacy_media",
        [
          "id",
          "original_url",
          "role",
          "v4_target_storage",
          "v4_target_key",
          "v4_access_policy",
          "legacy_user_id",
          "claimed_by_user_id",
          "status",
          "error_log",
        ],
        [
          sqlText(m.media_id),
          sqlText(m.source_url),
          sqlText(role),
          sqlText(storage),
          sqlText(keyOf(m)),
          sqlText(
            storage === "BANANTO_PRIVATE_BUCKET" ? "private" : m.visibility_intent || "public",
          ),
          sqlText(owner),
          "NULL",
          sqlText(options.mediaStatus || "reference_registered"),
          "NULL",
        ],
      );
    }),
  });

  return groups.filter((g) => g.statements.length > 0);
}

/** Splits statements into SQL file chunks that D1 accepts comfortably. */
export function chunkStatements(groups, maxStatements = 400) {
  const chunks = [];
  for (const group of groups) {
    for (let i = 0; i < group.statements.length; i += maxStatements) {
      chunks.push({
        table: group.table,
        index: Math.floor(i / maxStatements) + 1,
        sql: group.statements.slice(i, i + maxStatements).join("\n"),
        count: Math.min(maxStatements, group.statements.length - i),
      });
    }
  }
  return chunks;
}
