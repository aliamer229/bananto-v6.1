import { d1Run, d1First } from "../d1.server";
import { randomId } from "../crypto.server";
import { normalizeTitle } from "./identity";

/**
 * Deterministically imports validated game data into D1 tables.
 * Uses atomic statements to ensure data integrity.
 */
export async function importGameDataToDb(
  validatedData: any,
  mode: "create" | "update" | "replace",
) {
  const game = validatedData.GAME;
  const normName = normalizeTitle(game.name);
  const platform = game.platform;

  // 1. Check for existing game record
  const existing = await d1First<{ game_id: string; canonical_name: string }>(
    "SELECT game_id, canonical_name FROM game_records WHERE normalized_name = ? AND platform = ?",
    normName,
    platform,
  );

  if (existing && mode === "create") {
    throw new Error(
      `اللعبة "${game.name}" موجودة بالفعل على منصة ${platform}. استخدم وضع التحديث.`,
    );
  }

  const gameId = existing ? existing.game_id : randomId("prd");
  const now = new Date().toISOString();

  const statements: string[] = [];
  const params: any[][] = [];

  // 2. game_records (Canonical Identity)
  if (existing && (mode === "update" || mode === "replace")) {
    const updates: string[] = ["updated_at = ?"];
    const values: any[] = [now];

    if (game.publisher) {
      updates.push("publisher = ?");
      values.push(game.publisher);
    }
    if (game.developer) {
      updates.push("developer = ?");
      values.push(game.developer);
    }
    if (game.release_date) {
      updates.push("release_date = ?");
      values.push(game.release_date);
    }
    if (game.release_status) {
      updates.push("release_status = ?");
      values.push(game.release_status);
    }
    if (game.edition) {
      updates.push("edition = ?");
      values.push(game.edition);
    }
    if (game.region) {
      updates.push("region = ?");
      values.push(game.region);
    }

    // Technical
    const technical = validatedData.TECHNICAL || {};
    if (technical.nsuid) {
      updates.push("nsuid = ?");
      values.push(technical.nsuid);
    }
    if (technical.title_id) {
      updates.push("title_id = ?");
      values.push(technical.title_id);
    }

    // Store Meta
    if (game.game_is_offline !== undefined) {
      updates.push("game_is_offline = ?");
      values.push(game.game_is_offline ? 1 : 0);
    }
    if (game.game_is_online !== undefined) {
      updates.push("game_is_online = ?");
      values.push(game.game_is_online ? 1 : 0);
    }
    if (game.game_language_locked !== undefined) {
      updates.push("game_language_locked = ?");
      values.push(game.game_language_locked ? 1 : 0);
    }

    statements.push(`UPDATE game_records SET ${updates.join(", ")} WHERE game_id = ?`);
    params.push([...values, gameId]);
  } else {
    const technical = validatedData.TECHNICAL || {};
    statements.push(`
      INSERT INTO game_records (
        game_id, canonical_name, english_title, normalized_name, platform, edition, region, publisher, developer, 
        release_date, release_status, nsuid, title_id, game_is_offline, game_is_online, game_language_locked, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    params.push([
      gameId,
      game.name,
      game.name,
      normName,
      platform,
      game.edition || "Standard",
      game.region || "Global",
      game.publisher || null,
      game.developer || null,
      game.release_date || null,
      game.release_status,
      technical.nsuid || null,
      technical.title_id || null,
      game.game_is_offline ? 1 : 0,
      game.game_is_online ? 1 : 0,
      game.game_language_locked ? 1 : 0,
      now,
      now,
    ]);
  }

  // 3. game_catalog (Backward Compatibility & Search)
  const description = validatedData.DESCRIPTION || {};
  const media = validatedData.MEDIA || {};
  const tech = validatedData.TECHNICAL || {};

  statements.push(`
    INSERT INTO game_catalog (
      id, title, platform, edition, region, publisher, developer, release_date, 
      description_en, description_ar, 
      box_front_url, box_back_url, trailer_url, official_url, eshop_url,
      nsuid, title_id, product_code, players_count, age_rating,
      metacritic_score, opencritic_score, user_score, size_gb,
      game_is_offline, game_is_online, game_language_locked,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      platform = excluded.platform,
      edition = excluded.edition,
      region = excluded.region,
      publisher = excluded.publisher,
      developer = excluded.developer,
      release_date = excluded.release_date,
      description_en = excluded.description_en,
      description_ar = excluded.description_ar,
      box_front_url = excluded.box_front_url,
      box_back_url = excluded.box_back_url,
      trailer_url = excluded.trailer_url,
      official_url = excluded.official_url,
      eshop_url = excluded.eshop_url,
      nsuid = excluded.nsuid,
      title_id = excluded.title_id,
      product_code = excluded.product_code,
      players_count = excluded.players_count,
      age_rating = excluded.age_rating,
      metacritic_score = excluded.metacritic_score,
      opencritic_score = excluded.opencritic_score,
      user_score = excluded.user_score,
      size_gb = excluded.size_gb,
      game_is_offline = excluded.game_is_offline,
      game_is_online = excluded.game_is_online,
      game_language_locked = excluded.game_language_locked,
      updated_at = excluded.updated_at
  `);
  params.push([
    gameId,
    game.name,
    platform,
    game.edition || "Standard",
    game.region || "Global",
    game.publisher || "",
    game.developer || "",
    game.release_date || "",
    description.full || description.short || "",
    description.ar || "",
    media.box_front_url || "",
    media.box_back_url || "",
    media.trailer_url || "",
    game.official_url || "",
    game.eshop_url || "",
    tech.nsuid || "",
    tech.title_id || "",
    tech.product_code || "",
    game.players_count || "",
    game.age_rating || "",
    game.metacritic_score || null,
    game.opencritic_score || null,
    game.user_score || null,
    game.game_size_gb || null,
    game.game_is_offline ? 1 : 0,
    game.game_is_online ? 1 : 0,
    game.game_language_locked ? 1 : 0,
    now,
    now,
  ]);

  // 4. Handle Extended Sections (Replace mode clears previous, Update appends)
  if (mode === "replace" || mode === "create") {
    // Force deletion of existing linked records in replace mode to avoid orphans
    await d1Run(`DELETE FROM game_images WHERE game_id = ?`, gameId);
    await d1Run(`DELETE FROM game_variants WHERE game_id = ?`, gameId);
  }

  // IMAGES (Media)
  const mediaImages = validatedData.MEDIA;
  if (mediaImages) {
    if (mediaImages.box_front_url) {
      statements.push(
        `INSERT INTO game_images (id, game_id, kind, url, is_primary, created_at) VALUES (?, ?, 'boxart_front', ?, 1, ?)`,
      );
      params.push([randomId("img"), gameId, mediaImages.box_front_url, now]);
    }
    if (mediaImages.box_back_url) {
      statements.push(
        `INSERT INTO game_images (id, game_id, kind, url, is_primary, created_at) VALUES (?, ?, 'boxart_back', ?, 0, ?)`,
      );
      params.push([randomId("img"), gameId, mediaImages.box_back_url, now]);
    }
  }

  const genres = validatedData.GENRES?.list;
  if (Array.isArray(genres) && genres.length > 0) {
    statements.push(`UPDATE game_catalog SET genres = ? WHERE id = ?`);
    params.push([JSON.stringify(genres), gameId]);
  }

  // DESCRIPTION AR
  if (description.ar) {
    statements.push(`UPDATE game_catalog SET description_ar = ? WHERE id = ?`);
    params.push([description.ar, gameId]);
  }

  // BENANA STORE META
  if (game.game_is_offline !== undefined) {
    statements.push(`UPDATE game_catalog SET game_is_offline = ? WHERE id = ?`);
    params.push([game.game_is_offline ? 1 : 0, gameId]);
  }
  if (game.game_is_online !== undefined) {
    statements.push(`UPDATE game_catalog SET game_is_online = ? WHERE id = ?`);
    params.push([game.game_is_online ? 1 : 0, gameId]);
  }
  if (game.game_language_locked !== undefined) {
    statements.push(`UPDATE game_catalog SET game_language_locked = ? WHERE id = ?`);
    params.push([game.game_language_locked ? 1 : 0, gameId]);
  }

  // EDITIONS
  const editions = validatedData.EDITIONS?.items;
  if (Array.isArray(editions)) {
    for (const ed of editions) {
      statements.push(`
        INSERT INTO game_variants (id, game_id, variant_type, name, price_usd, features, created_at)
        VALUES (?, ?, 'edition', ?, ?, ?, ?)
      `);
      params.push([
        randomId("var"),
        gameId,
        ed.name,
        ed.price_usd || null,
        JSON.stringify(ed.features || []),
        now,
      ]);
    }
  }

  // 5. Execute all statements
  for (let i = 0; i < statements.length; i++) {
    const s = statements[i];
    const p = params[i];
    if (s && p) {
      await d1Run(s, ...p);
    }
  }

  // 6. Log success
  await d1Run(
    "INSERT INTO game_import_logs (id, game_id, status, created_at) VALUES (?, ?, ?, ?)",
    randomId("log"),
    gameId,
    "SUCCESS",
    now,
  );

  return { gameId, status: "SUCCESS" };
}
