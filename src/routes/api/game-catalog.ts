import { createFileRoute } from "@tanstack/react-router";
import { body, guard, json } from "@/lib/http.server";
import { requireAdmin } from "@/lib/session.server";
import { d1All, d1First, d1Run, ensureSchema } from "@/lib/d1.server";
import { randomId } from "@/lib/crypto.server";
import {
  addAlias,
  ensureCanonicalGame,
  getGame,
  listTradeRules,
  matchGame,
  searchGames,
  setTradeValue,
  backfillCanonicalIds,
} from "@/lib/game-catalog.server";
import { importNintendoTradeCatalog } from "@/lib/trade-catalog-import.server";
import { normalizeTitle, slugifyTitle } from "@/lib/gameData/identity";

const PRIVATE_GAME_FIELDS = new Set([
  "ai_suggested_trade_iqd",
  "trade_value_source",
  "trade_value_updated_at",
  "needs_review",
  "completeness",
]);

function publicGame(game: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(game).filter(([key]) => !PRIVATE_GAME_FIELDS.has(key)));
}

export const Route = createFileRoute("/api/game-catalog")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        guard(async () => {
          await ensureSchema();
          await backfillCanonicalIds();
          const url = new URL(request.url);
          const mode = url.searchParams.get("mode") || "list";
          const q = url.searchParams.get("q") || "";

          if (mode === "rules") {
            return json({ rules: await listTradeRules() });
          }

          if (mode === "match") {
            const match = await matchGame(q);
            if (!match) return json({ match: null });
            const game = await getGame(match.game_id);
            return json({
              match,
              game: game ? publicGame(game as unknown as Record<string, unknown>) : null,
            });
          }

          if (mode === "search") {
            const ranked = await searchGames(q, 12);
            const games = [] as unknown[];
            for (const r of ranked) {
              const g = await getGame(r.game_id);
              if (g)
                games.push({ ...publicGame(g as unknown as Record<string, unknown>), match: r });
            }
            return json({ items: games });
          }

          if (mode === "game") {
            const gameId = url.searchParams.get("game_id") || "";
            const game = await getGame(gameId);
            if (!game) return json({ error: "not found" }, { status: 404 });
            const images = await d1All(
              `SELECT id, game_id, kind, url, region, platform, edition, is_primary, width, height, description
                 FROM game_images WHERE game_id = ? ORDER BY confidence DESC`,
              gameId,
            );
            const aliases = await d1All(
              `SELECT alias, kind, language, region FROM game_aliases WHERE game_id = ?`,
              gameId,
            );
            // Extraction evidence, operator identities and price-change
            // history are administrative records, not storefront data.
            return json({
              game: publicGame(game as unknown as Record<string, unknown>),
              images,
              aliases,
            });
          }

          // Admin price manager listing with filters.
          await requireAdmin(request);
          const version = url.searchParams.get("version") || "";
          const filter = url.searchParams.get("filter") || "";
          const sort = url.searchParams.get("sort") || "updated";
          const limit = Math.max(
            1,
            Math.min(200, Math.floor(Number(url.searchParams.get("limit") || 60) || 60)),
          );

          const where: string[] = ["1=1"];
          const binds: unknown[] = [];
          if (q) {
            where.push("(title LIKE ? OR normalized_name LIKE ?)");
            binds.push(`%${q}%`, `%${normalizeTitle(q)}%`);
          }
          if (version === "switch1" || version === "switch2" || version === "both") {
            where.push("switch_version = ?");
            binds.push(version);
          }
          if (filter === "no_price") where.push("(trade_value_iqd IS NULL OR trade_value_iqd = 0)");
          if (filter === "stale")
            where.push(
              "(trade_value_updated_at IS NULL OR trade_value_updated_at < datetime('now','-90 day'))",
            );
          if (filter === "needs_review") where.push("needs_review = 1");
          if (filter === "incomplete") where.push("COALESCE(completeness,0) < 80");

          const order =
            sort === "price"
              ? "trade_value_iqd DESC"
              : sort === "title"
                ? "title ASC"
                : "COALESCE(updated_at, created_at) DESC";

          const items = await d1All(
            `SELECT * FROM game_catalog WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ?`,
            ...binds,
            limit,
          );
          const stats = await d1First<Record<string, number>>(
            `SELECT COUNT(*) AS total,
                    SUM(CASE WHEN switch_version = 'switch2' THEN 1 ELSE 0 END) AS switch2,
                    SUM(CASE WHEN trade_value_iqd IS NULL OR trade_value_iqd = 0 THEN 1 ELSE 0 END) AS no_price,
                    SUM(CASE WHEN store_offer_bonus_iqd > 0 THEN 1 ELSE 0 END) AS with_bonus,
                    SUM(CASE WHEN trade_value_locked = 1 THEN 1 ELSE 0 END) AS locked_count,
                    SUM(CASE WHEN trade_enabled = 1 THEN 1 ELSE 0 END) AS trade_enabled_count,
                    SUM(CASE WHEN needs_review = 1 THEN 1 ELSE 0 END) AS needs_review
             FROM game_catalog`,
          );
          return json({ items, stats });
        }),

      POST: async ({ request }) =>
        guard(async () => {
          await ensureSchema();
          const admin = await requireAdmin(request);
          const data = await body<Record<string, unknown>>(request);
          const action = String(data["action"] || "upsert");
          const actor = String((admin as { email?: string }).email ?? "admin");

          if (action === "import_trade_catalog") {
            const overwriteLocked = Boolean(data["overwrite_locked"]);
            const offset = data["offset"] !== undefined ? Number(data["offset"]) : undefined;
            const limit = data["limit"] !== undefined ? Number(data["limit"]) : undefined;
            const result = await importNintendoTradeCatalog({
              overwriteLocked,
              actor,
              offset,
              limit,
            });
            return json({ success: true, result });
          }

          if (action === "set_price") {
            const gameId = String(data["game_id"] || "");
            if (!gameId) return json({ error: "game_id required" }, { status: 400 });
            const bonusIqd =
              data["store_offer_bonus_iqd"] !== undefined
                ? Number(data["store_offer_bonus_iqd"])
                : undefined;
            const locked =
              data["trade_value_locked"] !== undefined
                ? Boolean(data["trade_value_locked"])
                : undefined;
            const tradeEnabled =
              data["trade_enabled"] !== undefined ? Boolean(data["trade_enabled"]) : undefined;

            await setTradeValue(
              gameId,
              Number(data["trade_value_iqd"] || 0),
              "admin",
              actor,
              bonusIqd,
              { locked, tradeEnabled },
            );
            return json({ success: true });
          }

          if (action === "bulk_price") {
            const updates = Array.isArray(data["updates"])
              ? (data["updates"] as {
                  game_id: string;
                  trade_value_iqd: number;
                  store_offer_bonus_iqd?: number;
                  trade_value_locked?: boolean;
                  trade_enabled?: boolean;
                }[])
              : [];
            for (const u of updates) {
              if (!u?.game_id) continue;
              await setTradeValue(
                u.game_id,
                Number(u.trade_value_iqd || 0),
                "admin_bulk",
                actor,
                u.store_offer_bonus_iqd,
                { locked: u.trade_value_locked, tradeEnabled: u.trade_enabled },
              );
            }
            return json({ success: true, updated: updates.length });
          }

          if (action === "save_rule") {
            const id = String(data["id"] || randomId("trule"));
            const category = String(data["category"] || "").trim();
            const key = String(data["key"] || "").trim();
            const labelAr = String(data["label_ar"] || "").trim();
            const labelEn = data["label_en"] ? String(data["label_en"]).trim() : null;
            const percent = Number(data["percent"] || 0);
            const sortOrder = Number(data["sort_order"] || 0);
            const active = data["active"] !== undefined ? (data["active"] ? 1 : 0) : 1;
            const now = new Date().toISOString();

            if (!category || !key || !labelAr) {
              return json({ error: "category, key, and label_ar are required" }, { status: 400 });
            }

            await d1Run(
              `INSERT INTO trade_rules (id, category, key, label_ar, label_en, percent, sort_order, active, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 category = excluded.category,
                 key = excluded.key,
                 label_ar = excluded.label_ar,
                 label_en = excluded.label_en,
                 percent = excluded.percent,
                 sort_order = excluded.sort_order,
                 active = excluded.active`,
              id,
              category,
              key,
              labelAr,
              labelEn,
              percent,
              sortOrder,
              active,
              now,
            );
            return json({ success: true, id });
          }

          if (action === "bulk_save_rules") {
            const rulesList = Array.isArray(data["rules"]) ? data["rules"] : [];
            const now = new Date().toISOString();
            for (const r of rulesList) {
              const id = String(r.id || randomId("trule"));
              const category = String(r.category || "").trim();
              const key = String(r.key || "").trim();
              const labelAr = String(r.label_ar || "").trim();
              const labelEn = r.label_en ? String(r.label_en).trim() : null;
              const percent = Number(r.percent || 0);
              const sortOrder = Number(r.sort_order || 0);
              const active = r.active !== undefined ? (r.active ? 1 : 0) : 1;

              if (category && key && labelAr) {
                await d1Run(
                  `INSERT INTO trade_rules (id, category, key, label_ar, label_en, percent, sort_order, active, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET
                     category = excluded.category,
                     key = excluded.key,
                     label_ar = excluded.label_ar,
                     label_en = excluded.label_en,
                     percent = excluded.percent,
                     sort_order = excluded.sort_order,
                     active = excluded.active`,
                  id,
                  category,
                  key,
                  labelAr,
                  labelEn,
                  percent,
                  sortOrder,
                  active,
                  now,
                );
              }
            }
            return json({ success: true, count: rulesList.length });
          }

          if (action === "reset_rules_default") {
            await d1Run(`DELETE FROM trade_rules`);
            const defaultRules = [
              {
                category: "box_presence",
                key: "original_box",
                label_ar: "مع العلبة الأصلية بحالة ممتازة",
                label_en: "Original box in good shape",
                percent: 0,
                sort_order: 1,
              },
              {
                category: "box_presence",
                key: "damaged_box",
                label_ar: "علبة أصلية متضررة أو مكسورة",
                label_en: "Damaged original box",
                percent: -10,
                sort_order: 2,
              },
              {
                category: "box_presence",
                key: "no_box",
                label_ar: "بدون علبة (فقط الكارتريج)",
                label_en: "Cartridge only (no box)",
                percent: -25,
                sort_order: 3,
              },
              {
                category: "box_presence",
                key: "new_sealed",
                label_ar: "جديدة بالقرطاس (مغلقة المصنع)",
                label_en: "Brand new sealed",
                percent: 15,
                sort_order: 0,
              },
              {
                category: "cartridge_condition",
                key: "like_new",
                label_ar: "شبه جديد (خالي من الخدوش)",
                label_en: "Like new, no scratches",
                percent: 0,
                sort_order: 1,
              },
              {
                category: "cartridge_condition",
                key: "minor_scratches",
                label_ar: "خدوش خفيفة لا تؤثر على القراءة",
                label_en: "Minor cosmetic scratches",
                percent: -10,
                sort_order: 2,
              },
              {
                category: "cartridge_condition",
                key: "heavily_scratched",
                label_ar: "خدوش واضحة / متآكل الملصق",
                label_en: "Heavy wear / peeling label",
                percent: -30,
                sort_order: 3,
              },
              {
                category: "accessories",
                key: "complete",
                label_ar: "كامل (الكتيبات أو الأوراق سليمة)",
                label_en: "Complete with inserts",
                percent: 0,
                sort_order: 1,
              },
              {
                category: "accessories",
                key: "missing_inserts",
                label_ar: "بدون كتيبات أو ملحقات داخلية",
                label_en: "Missing manuals / inserts",
                percent: -5,
                sort_order: 2,
              },
              {
                category: "region_version",
                key: "us_middle_east",
                label_ar: "نسخة أمريكية / الشرق الأوسط (MDE/USA)",
                label_en: "US / Middle East version",
                percent: 0,
                sort_order: 1,
              },
              {
                category: "region_version",
                key: "european",
                label_ar: "نسخة أوروبية (EUR)",
                label_en: "European version",
                percent: 0,
                sort_order: 2,
              },
              {
                category: "region_version",
                key: "japanese_asian",
                label_ar: "نسخة يابانية / آسيوية (JPN/ASI)",
                label_en: "Japanese / Asian version",
                percent: -10,
                sort_order: 3,
              },
              {
                category: "payout_method",
                key: "store_credit",
                label_ar: "رصيد في المحفظة (مكافأة إضافية)",
                label_en: "Store credit bonus",
                percent: 10,
                sort_order: 1,
              },
              {
                category: "payout_method",
                key: "cash",
                label_ar: "نقداً",
                label_en: "Cash payout",
                percent: 0,
                sort_order: 2,
              },
            ];
            const now = new Date().toISOString();
            for (const r of defaultRules) {
              await d1Run(
                `INSERT INTO trade_rules (id, category, key, label_ar, label_en, percent, sort_order, active, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
                randomId("trl"),
                r.category,
                r.key,
                r.label_ar,
                r.label_en,
                r.percent,
                r.sort_order,
                now,
              );
            }
            return json({ success: true, count: defaultRules.length });
          }

          if (action === "toggle_rule") {
            const id = String(data["id"] || "");
            if (!id) return json({ error: "id required" }, { status: 400 });
            const rule = await d1First<{ active: number }>(
              `SELECT active FROM trade_rules WHERE id = ?`,
              id,
            );
            if (!rule) return json({ error: "rule not found" }, { status: 404 });
            const nextActive = rule.active ? 0 : 1;
            await d1Run(`UPDATE trade_rules SET active = ? WHERE id = ?`, nextActive, id);
            return json({ success: true, active: nextActive });
          }

          if (action === "delete_rule") {
            const id = String(data["id"] || "");
            if (!id) return json({ error: "id required" }, { status: 400 });
            await d1Run(`DELETE FROM trade_rules WHERE id = ?`, id);
            return json({ success: true });
          }

          if (action === "add_alias") {
            const gameId = String(data["game_id"] || "");
            const alias = String(data["alias"] || "");
            if (!gameId || !alias)
              return json({ error: "game_id and alias required" }, { status: 400 });
            await addAlias(gameId, alias, String(data["kind"] || "user_variant"));
            return json({ success: true });
          }

          if (action === "resolve_review") {
            const gameId = String(data["game_id"] || "");
            await d1Run(`UPDATE game_catalog SET needs_review = 0 WHERE game_id = ?`, gameId);
            return json({ success: true });
          }

          // Default: create / update a canonical record.
          const title = String(data["title"] || "").trim();
          if (!title) return json({ error: "Title is required" }, { status: 400 });
          const { game } = await ensureCanonicalGame(title);

          const editable = [
            "description_ar",
            "description_en",
            "cover_url",
            "platform",
            "publisher",
            "developer",
            "release_date",
            "switch_version",
            "edition",
            "region",
            "trailer_url",
            "official_url",
            "eshop_url",
          ];
          for (const field of editable) {
            if (data[field] === undefined) continue;
            await d1Run(
              `UPDATE game_catalog SET ${field} = ?, updated_at = ? WHERE game_id = ?`,
              data[field] === null ? null : String(data[field]),
              new Date().toISOString(),
              game.game_id,
            );
          }
          if (data["genres"] !== undefined) {
            await d1Run(
              `UPDATE game_catalog SET genres = ? WHERE game_id = ?`,
              JSON.stringify(data["genres"] ?? []),
              game.game_id,
            );
          }
          if (data["trade_value_iqd"] !== undefined) {
            await setTradeValue(game.game_id, Number(data["trade_value_iqd"] || 0), "admin", actor);
          }
          await d1Run(
            `UPDATE game_catalog SET slug = COALESCE(slug, ?) WHERE game_id = ?`,
            slugifyTitle(title),
            game.game_id,
          );

          return json({ success: true, game_id: game.game_id });
        }),
    },
  },
});
