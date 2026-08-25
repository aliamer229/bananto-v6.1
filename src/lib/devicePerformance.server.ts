import {
  getDevicePerformanceList,
  performanceSummary,
  slugifyDevice,
  type DevicePerformance,
} from "./devicePerformance";
import { d1BatchRun, d1First, ensureSchema } from "./d1.server";

type ProductRecord = Record<string, any>;

const DATABASE_COLUMNS = [
  "id",
  "game_id",
  "hardware_id",
  "device_name",
  "device_slug",
  "device_model",
  "active",
  "revision",
  "information_status",
  "unavailable_reason",
  "handheld_supported",
  "handheld_resolution",
  "handheld_rendering_resolution",
  "handheld_output_resolution",
  "handheld_fps",
  "handheld_fps_min",
  "handheld_fps_max",
  "handheld_refresh_rate",
  "handheld_hdr",
  "handheld_vrr",
  "handheld_notes",
  "tv_supported",
  "tv_resolution",
  "tv_rendering_resolution",
  "tv_output_resolution",
  "tv_fps",
  "tv_fps_min",
  "tv_fps_max",
  "tv_refresh_rate",
  "tv_hdr",
  "tv_vrr",
  "tv_notes",
  "upscaling",
  "ray_tracing",
  "ray_tracing_mode",
  "loading_time",
  "loading_notes",
  "game_version",
  "patch_version",
  "tested_date",
  "source_name",
  "source_url",
  "verification_status",
  "verified_at",
  "performance_notes",
  "performance_summary",
  "data_hash",
  "created_at",
  "updated_at",
] as const;

const databaseBool = (value: boolean | undefined) => (value === undefined ? null : value ? 1 : 0);

async function contentHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hardwareIdentity(record: DevicePerformance, hardwareProducts: ProductRecord[]) {
  const wantedSlug = record.deviceSlug || slugifyDevice(record.device);
  const hardware = hardwareProducts.find((product) => {
    const slug = slugifyDevice(product.slug || product.title || product.name);
    return (
      (record.hardwareId && String(product.id) === record.hardwareId) ||
      slug === wantedSlug ||
      slugifyDevice(product.title || product.name) === wantedSlug
    );
  });
  return {
    hardwareId: String(record.hardwareId || hardware?.id || `slug:${wantedSlug}`),
    deviceName: String(record.device || hardware?.title || hardware?.name || wantedSlug),
    deviceSlug: wantedSlug,
    deviceModel: String(record.deviceModel || hardware?.model || hardware?.modelNumber || ""),
  };
}

function databaseRow(
  id: string,
  gameId: string,
  hardwareId: string,
  identity: ReturnType<typeof hardwareIdentity>,
  record: DevicePerformance,
  revision: number,
  hash: string,
  now: string,
): unknown[] {
  const handheld = record.handheld;
  const tv = record.tv;
  return [
    id,
    gameId,
    hardwareId,
    identity.deviceName,
    identity.deviceSlug,
    identity.deviceModel || null,
    1,
    revision,
    record.informationStatus || "available",
    record.unavailableReason || null,
    databaseBool(handheld?.supported),
    handheld?.resolution || null,
    handheld?.renderingResolution || null,
    handheld?.outputResolution || null,
    handheld?.fps || null,
    handheld?.fpsMin || null,
    handheld?.fpsMax || null,
    handheld?.refreshRate || null,
    databaseBool(handheld?.hdr),
    databaseBool(handheld?.vrr),
    handheld?.notes || null,
    databaseBool(tv?.supported),
    tv?.resolution || null,
    tv?.renderingResolution || null,
    tv?.outputResolution || null,
    tv?.fps || null,
    tv?.fpsMin || null,
    tv?.fpsMax || null,
    tv?.refreshRate || null,
    databaseBool(tv?.hdr),
    databaseBool(tv?.vrr),
    tv?.notes || null,
    record.upscaling || null,
    databaseBool(record.rayTracing),
    record.rayTracingMode || null,
    record.loadingTime || null,
    record.loadingNotes || null,
    record.gameVersion || null,
    record.patchVersion || null,
    record.testedDate || null,
    record.sourceName || null,
    record.sourceUrl || null,
    record.verificationStatus || null,
    record.verifiedAt || null,
    record.performanceNotes || null,
    performanceSummary(record),
    hash,
    now,
    now,
  ];
}

/**
 * Synchronises the indexed/history projection after a game save. The product's
 * `devicePerformance` array remains canonical; this function never mutates it.
 */
export async function syncGameDevicePerformance(
  game: ProductRecord,
  hardwareProducts: ProductRecord[] = [],
): Promise<void> {
  const gameId = String(game.id || "").trim();
  if (!gameId) return;
  await ensureSchema();

  const records = getDevicePerformanceList(game);
  const prepared = await Promise.all(
    records.map(async (record) => {
      const identity = hardwareIdentity(record, hardwareProducts);
      return { record, identity, hash: await contentHash(record) };
    }),
  );
  const activeHardwareIds = prepared.map(({ identity }) => identity.hardwareId);
  const statements: { sql: string; binds?: unknown[] }[] = [];

  if (activeHardwareIds.length) {
    statements.push({
      sql: `UPDATE game_device_performance
            SET active = 0, superseded_at = ?, updated_at = ?
            WHERE game_id = ? AND active = 1
              AND hardware_id NOT IN (${activeHardwareIds.map(() => "?").join(",")})`,
      binds: [new Date().toISOString(), new Date().toISOString(), gameId, ...activeHardwareIds],
    });
  } else {
    statements.push({
      sql: `UPDATE game_device_performance
            SET active = 0, superseded_at = ?, updated_at = ?
            WHERE game_id = ? AND active = 1`,
      binds: [new Date().toISOString(), new Date().toISOString(), gameId],
    });
  }

  for (const { record, identity, hash } of prepared) {
    const current = await d1First<{ id?: string; data_hash?: string; revision?: number }>(
      `SELECT id, data_hash, revision FROM game_device_performance
       WHERE game_id = ? AND hardware_id = ? AND active = 1 ORDER BY revision DESC, updated_at DESC LIMIT 1`,
      gameId,
      identity.hardwareId,
    );
    const now = new Date().toISOString();

    if (current?.id && current.data_hash === hash) {
      // Ensure any rogue duplicate active records for the same game & hardware are marked inactive
      statements.push({
        sql: `UPDATE game_device_performance
              SET active = 0, superseded_at = ?, updated_at = ?
              WHERE game_id = ? AND hardware_id = ? AND active = 1 AND id != ?`,
        binds: [now, now, gameId, identity.hardwareId, current.id],
      });
      continue;
    }

    // Deactivate ALL existing active records for this game_id + hardware_id before inserting new record
    statements.push({
      sql: `UPDATE game_device_performance
            SET active = 0, superseded_at = ?, updated_at = ?
            WHERE game_id = ? AND hardware_id = ? AND active = 1`,
      binds: [now, now, gameId, identity.hardwareId],
    });

    const performanceId = `gdp_${crypto.randomUUID().replace(/-/g, "")}`;
    const row = databaseRow(
      performanceId,
      gameId,
      identity.hardwareId,
      identity,
      record,
      Number(current?.revision || 0) + 1,
      hash,
      now,
    );
    statements.push({
      sql: `INSERT INTO game_device_performance (${DATABASE_COLUMNS.join(", ")})
            VALUES (${DATABASE_COLUMNS.map(() => "?").join(", ")})`,
      binds: row,
    });

    for (const [index, mode] of (record.modes || []).entries()) {
      statements.push({
        sql: `INSERT INTO game_device_performance_modes
              (id, performance_id, display_order, name, handheld_resolution, handheld_fps,
               tv_resolution, tv_fps, hdr, vrr, notes, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        binds: [
          `gdpm_${crypto.randomUUID().replace(/-/g, "")}`,
          performanceId,
          index,
          mode.name,
          mode.handheldResolution || null,
          mode.handheldFps || null,
          mode.tvResolution || null,
          mode.tvFps || null,
          databaseBool(mode.hdr),
          databaseBool(mode.vrr),
          mode.notes || null,
          now,
        ],
      });
    }
  }

  if (statements.length) await d1BatchRun(statements);
}

export async function deactivateGameDevicePerformance(gameId: string): Promise<void> {
  await ensureSchema();
  const now = new Date().toISOString();
  await d1BatchRun([
    {
      sql: `UPDATE game_device_performance
            SET active = 0, superseded_at = ?, updated_at = ?
            WHERE game_id = ? AND active = 1`,
      binds: [now, now, gameId],
    },
  ]);
}
