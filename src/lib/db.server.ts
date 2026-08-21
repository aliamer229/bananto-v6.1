import { randomAvatar, randomDisplayName } from "./avatars";
import { randomId, hashPassword } from "./crypto.server";
import {
  d1All as d1RawAll,
  d1First as d1RawFirst,
  d1Run as d1RawRun,
  d1RunChanges,
  ensureSchema,
  ensureUsersSchema,
  getD1,
} from "./d1.server";
import { normalizePhone, arePhonesEqual } from "./phone";
import { listKeys, mutateJson, readJson, writeJson } from "./storage.server";
import { sendWhatsappMessage } from "./whatsapp.server";
import { sendTelegramMessage } from "./telegram.server";
import { isOwnerAccount } from "./owner-auth.server";
import {
  type AdminAvailabilityConfig,
  type AdminAvailabilityStatus,
  checkAdminAvailability,
  DEFAULT_AVAILABILITY_CONFIG,
} from "./admin-availability";
export {
  isOwnerAccount,
  isOwnerEmail,
  isOwnerPhone,
  verifiedOwnerIdentity,
} from "./owner-auth.server";
export type { AdminAvailabilityConfig, AdminAvailabilityStatus };
export { checkAdminAvailability, DEFAULT_AVAILABILITY_CONFIG };

import type {
  Address,
  BananCode,
  ChatMessage,
  Gender,
  Order,
  PublicUser,
  StoreDoc,
  Thread,
  User,
  UserSettings,
  WalletRechargeRequest,
  WalletTransaction,
  WalletTransactionKind,
  ProductReview,
  ReviewStatus,
  Coupon,
  BananaLedgerEntry,
  BananaMarketOffer,
  BananaRedemptionOffer,
  BananaBot,
  StoreBanner,
  StoreGuide,
  ProblemSolution,
  GameRequest,
  DiscTrade,
  AuditLog,
  StoreNotification,
} from "./types";

/**
 * Executes multiple D1 statements in a single batch transaction.
 * Falls back to sequential execution in non-D1 environments.
 */
export async function d1Batch(sqls: { sql: string; params: unknown[] }[]) {
  const db = getD1();
  if (db && db.batch) {
    const stmts = sqls.map((s) => db.prepare(s.sql).bind(...s.params));
    return db.batch(stmts);
  } else {
    for (const s of sqls) {
      await d1RawRun(s.sql, ...s.params);
    }
    return [];
  }
}

export async function createNotification(
  userId: string,
  title: string,
  body: string,
  link?: string,
) {
  await d1RawRun(
    `INSERT INTO notifications (id, user_id, title, body, link, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
    randomId("ntf"),
    userId,
    title,
    body,
    link || null,
    new Date().toISOString(),
  );
}

export async function createAuditLog(
  actorId: string,
  action: string,
  entityType?: string,
  entityId?: string,
  oldVal?: any,
  newVal?: any,
  details?: any,
) {
  await d1RawRun(
    `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_value, new_value, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    randomId("aud"),
    actorId,
    action,
    entityType || null,
    entityId || null,
    oldVal ? JSON.stringify(oldVal) : null,
    newVal ? JSON.stringify(newVal) : null,
    details ? JSON.stringify(details) : null,
    new Date().toISOString(),
  );
}

// Export raw D1 helpers for use in other server routes
export const d1All = d1RawAll;
export const d1First = d1RawFirst;
export async function d1Run(
  sql: string,
  ...binds: unknown[]
): Promise<{ meta: { changes: number } }> {
  const changes = await d1RunChanges(sql, ...binds).catch(() => 0);
  return { meta: { changes } };
}
export const d1Execute = d1RawRun;
export { randomId, hashPassword } from "./crypto.server";

const STORE_KEY = "store.json";
const USERS_KEY = "users.json";
const ORDER_INDEX_KEY = "orders/index.json";
const THREAD_INDEX_KEY = "threads/index.json";

export const emptyStore: StoreDoc = {
  banners: [],
  products: [],
  categories: [],
  musicList: [],
  notifications: [],
  settings: {},
  quickReplies: [],
  autoReplies: {
    onlineIntro: "مرحباً بك! فريق الدعم متصل الآن وسيرد عليك خلال دقائق.",
    offlineIntro: "مرحباً بك! فريق الدعم غير متصل حالياً، اترك رسالتك وسيتم الرد قريباً.",
  },
  adminPresence: { online: false },
  paymentMethods: [],
  visits: 0,
  views: 0,
  gameRequests: [],
  discTrades: [],
  problemSolutions: [],
};

const defaultSettings: UserSettings = {
  language: "ar",
  theme: "light",
  soundEnabled: true,
  musicEnabled: true,
};

/** True when running on Cloudflare with the D1 binding available. */
export async function d1Ready() {
  if (!getD1()) return false;
  // When D1 is configured, schema/query failures must fail closed. Silently
  // falling back to JSON storage here creates a split-brain production store.
  await Promise.all([ensureSchema(), ensureUsersSchema()]);
  return true;
}

function parse<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/* ---------------------------------- store --------------------------------- */

/**
 * The store document is one large JSON blob (the whole catalogue). Reading it
 * from D1 costs a full round trip, so keep the last copy in the isolate for a
 * few seconds and let bursts of requests share a single read.
 */
let storeCache: { doc: StoreDoc; at: number } | undefined;
let storeInFlight: Promise<StoreDoc> | undefined;
const STORE_TTL_MS = 60_000;

export function invalidateStoreCache() {
  storeCache = undefined;
}

/**
 * D1 rejects single column values above ~1MB, and the catalogue blob passed
 * that ceiling once products carried full hub data. The heavy sections are
 * therefore stored in their own rows (and split into chunks when a single
 * section is still too big), so saving a product never fails on size.
 */
const HEAVY_SECTIONS = ["products", "banners", "content", "bundles"] as const;
const CHUNK_LIMIT = 600_000;

function chunkJson(value: unknown): string[] {
  const raw = JSON.stringify(value ?? null);
  if (raw.length <= CHUNK_LIMIT) return [raw];
  const parts: string[] = [];
  for (let i = 0; i < raw.length; i += CHUNK_LIMIT) parts.push(raw.slice(i, i + CHUNK_LIMIT));
  return parts;
}

/**
 * Visit/view counters live in their own `store_kv` rows rather than inside the
 * store blob. Tracking a page view used to go through `updateStore()`, which
 * rewrites the entire catalogue (products, banners, content, bundles — hundreds
 * of KB) on every single hit and could clobber a concurrent admin edit. They are
 * overlaid onto the loaded document below so readers still see `store.visits`
 * and `store.views` exactly as before.
 */
const COUNTER_KEYS = { visits: "analytics:visits", views: "analytics:views" } as const;

async function loadStore(): Promise<StoreDoc> {
  if (await d1Ready()) {
    const rows = await d1RawAll<{ key: string; value: string }>(
      `SELECT key, value FROM store_kv
       WHERE key = 'store' OR key LIKE 'store:%' OR key LIKE 'analytics:%'`,
    );
    const base = rows.find((r) => r.key === "store");
    const doc = { ...emptyStore, ...parse<Partial<StoreDoc>>(base?.value, {}) } as Record<
      string,
      unknown
    >;

    for (const section of HEAVY_SECTIONS) {
      const parts = rows
        .filter((r) => r.key === `store:${section}` || r.key.startsWith(`store:${section}#`))
        .sort((a, b) => a.key.localeCompare(b.key, "en", { numeric: true }))
        .map((r) => r.value)
        .join("");
      if (!parts) continue;
      const parsed = parse<unknown>(parts, undefined as unknown);
      if (parsed !== undefined) doc[section] = parsed;
    }

    for (const [field, key] of Object.entries(COUNTER_KEYS)) {
      const row = rows.find((r) => r.key === key);
      if (!row) continue;
      const value = Number(row.value);
      if (Number.isFinite(value)) doc[field] = value;
    }

    return doc as unknown as StoreDoc;
  }
  return readJson<StoreDoc>(STORE_KEY, emptyStore);
}

/**
 * Bump the site counters without touching the catalogue.
 *
 * The increment happens inside the UPSERT so parallel hits add up instead of
 * overwriting each other. The first write seeds from whatever the store blob
 * already held, so existing totals carry over.
 */
export async function incrementSiteCounters(delta: {
  visits?: number;
  views?: number;
}): Promise<{ visits: number; views: number }> {
  const store = await getStore();
  const current = { visits: store.visits ?? 0, views: store.views ?? 0 };
  const next = {
    visits: current.visits + (delta.visits ?? 0),
    views: current.views + (delta.views ?? 0),
  };

  if (!(await d1Ready())) {
    await updateStore((doc) => ({ ...doc, ...next }));
    return next;
  }

  const now = new Date().toISOString();
  for (const [field, key] of Object.entries(COUNTER_KEYS) as ["visits" | "views", string][]) {
    const amount = delta[field] ?? 0;
    if (!amount) continue;
    await d1Execute(
      `INSERT INTO store_kv (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = CAST(CAST(store_kv.value AS INTEGER) + ? AS TEXT),
         updated_at = excluded.updated_at`,
      key,
      String(next[field]),
      now,
      amount,
    );
  }

  // Keep the in-isolate cache coherent so the next reader does not serve a
  // stale total for the rest of the TTL.
  if (storeCache) storeCache = { doc: { ...storeCache.doc, ...next }, at: storeCache.at };
  return next;
}

async function persistStore(next: StoreDoc) {
  const now = new Date().toISOString();
  const write = (key: string, value: string) =>
    d1Execute(
      `INSERT INTO store_kv (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      key,
      value,
      now,
    );

  const base = { ...(next as unknown as Record<string, unknown>) };
  for (const section of HEAVY_SECTIONS) delete base[section];
  await write("store", JSON.stringify(base));

  for (const section of HEAVY_SECTIONS) {
    const parts = chunkJson((next as unknown as Record<string, unknown>)[section]);
    if (parts.length === 1) {
      await write(`store:${section}`, parts[0]!);
    } else {
      // Multi-part payloads are stored as `store:section#001…` so the loader can
      // stitch them back together in order.
      await write(`store:${section}`, "");
      for (let i = 0; i < parts.length; i++) {
        await write(`store:${section}#${String(i + 1).padStart(3, "0")}`, parts[i]!);
      }
    }
    // Drop stale chunks from a previous, longer save.
    await d1Execute(
      `DELETE FROM store_kv WHERE key LIKE ? AND key > ?`,
      `store:${section}#%`,
      `store:${section}#${String(parts.length === 1 ? 0 : parts.length).padStart(3, "0")}`,
    );
  }
}

export async function getStore(): Promise<StoreDoc> {
  const now = Date.now();
  if (storeCache && now - storeCache.at < STORE_TTL_MS) return storeCache.doc;

  if (storeInFlight) return storeInFlight;

  storeInFlight = loadStore()
    .then((doc) => {
      storeCache = { doc, at: Date.now() };
      return doc;
    })
    .finally(() => {
      storeInFlight = undefined;
    });

  return storeInFlight;
}

export async function updateStore(mutate: (current: StoreDoc) => StoreDoc): Promise<StoreDoc> {
  const current = await getStore();
  const next = mutate(current);

  if (await d1Ready()) {
    await persistStore(next);
  } else {
    await mutateJson<StoreDoc>(STORE_KEY, emptyStore, mutate);
  }

  storeCache = { doc: next, at: Date.now() };

  // Notification: Product Price Change.
  // Collect the changes first: the previous version called getUsers() — a full
  // table scan — once per repriced product, so a bulk catalogue save loaded
  // every user hundreds of times while the admin's request was still open.
  const previousPrices = new Map(
    (current.products ?? []).map((product) => [String(product.id), product.price]),
  );
  const repriced = (next.products ?? []).filter((product) => {
    const before = previousPrices.get(String(product.id));
    return before !== undefined && before !== product.price;
  });

  if (repriced.length > 0) {
    const users = await getUsers();
    const watchers = users.filter((u) => u.telegramId && u.favorites?.length);
    for (const product of repriced) {
      const before = previousPrices.get(String(product.id));
      for (const watcher of watchers) {
        if (!watcher.favorites?.includes(product.id)) continue;
        await sendTelegramMessage(
          watcher.telegramId!,
          `🔔 *تنبيه تغيير السعر*\n\nتغير سعر المنتج *${product.title}* الذي تتابعه.\n\nالسعر السابق: ${before} IQD\nالسعر الجديد: ${product.price} IQD`,
        );
      }
    }
  }

  return next;
}

/* -------------------------- admin availability ---------------------------- */

export async function getAdminAvailabilityConfig(): Promise<AdminAvailabilityConfig> {
  if (await d1Ready()) {
    const row = await d1First<{ value: string }>(
      `SELECT value FROM store_kv WHERE key = ?`,
      "admin_availability",
    );
    if (row?.value) {
      return {
        ...DEFAULT_AVAILABILITY_CONFIG,
        ...parse<Partial<AdminAvailabilityConfig>>(row.value, {}),
      };
    }
  }
  const store = await getStore();
  const raw = store.settings?.["admin_availability"];
  if (raw && typeof raw === "object") {
    return { ...DEFAULT_AVAILABILITY_CONFIG, ...(raw as Partial<AdminAvailabilityConfig>) };
  }
  if (store.adminPresence) {
    return {
      ...DEFAULT_AVAILABILITY_CONFIG,
      mode: store.adminPresence.online ? "available" : "unavailable",
    };
  }
  return DEFAULT_AVAILABILITY_CONFIG;
}

export async function saveAdminAvailabilityConfig(
  config: Partial<AdminAvailabilityConfig>,
): Promise<AdminAvailabilityConfig> {
  const current = await getAdminAvailabilityConfig();
  const next: AdminAvailabilityConfig = {
    ...current,
    ...config,
    updatedAt: new Date().toISOString(),
  };

  if (await d1Ready()) {
    await d1Execute(
      `INSERT INTO store_kv (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      "admin_availability",
      JSON.stringify(next),
      next.updatedAt,
    );
  }

  const availability = checkAdminAvailability(next);

  await updateStore((s) => ({
    ...s,
    adminPresence: {
      online: availability.isAvailable,
      updatedAt: next.updatedAt,
    },
    settings: {
      ...s.settings,
      admin_availability: next,
    },
  }));

  return next;
}

export async function getAdminAvailabilityStatus(): Promise<AdminAvailabilityStatus> {
  const config = await getAdminAvailabilityConfig();
  return checkAdminAvailability(config);
}

/* ---------------------------------- users --------------------------------- */

interface UserRow {
  id: string;
  name: string;
  username: string | null;
  member_no: string | null;
  email: string;
  email_verified_at?: string | null;
  phone: string | null;
  phone_verified_at: string | null;
  password_hash: string;
  avatar: string | null;
  gender: string | null;
  birth_date: string | null;
  preferred_genres: string | null;
  profile_completed_at: string | null;
  is_admin: number;
  provider: string;
  provider_id: string | null;
  settings: string;
  addresses: string;
  favorites: string;
  friend_id?: string | null;
  wallet_balance: number;
  banana_balance: number;
  banana_locked: number;
  created_at: string;
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    ...(row.username ? { username: row.username } : {}),
    ...(row.member_no ? { memberNo: row.member_no } : {}),
    email: row.email,
    ...(row.email_verified_at ? { emailVerifiedAt: row.email_verified_at } : {}),
    ...(row.phone ? { phone: row.phone } : {}),
    ...(row.phone_verified_at ? { phoneVerifiedAt: row.phone_verified_at } : {}),
    passwordHash: row.password_hash,
    ...(row.avatar ? { avatar: row.avatar } : {}),
    ...(row.gender ? { gender: row.gender as Gender } : {}),
    ...(row.birth_date ? { birthDate: row.birth_date } : {}),
    preferredGenres: parse<string[]>(row.preferred_genres, []),
    ...(row.profile_completed_at ? { profileCompletedAt: row.profile_completed_at } : {}),
    isAdmin: row.is_admin === 1,
    provider: (row.provider as User["provider"]) ?? "password",
    ...(row.provider_id ? { providerId: row.provider_id } : {}),
    settings: { ...defaultSettings, ...parse<Partial<UserSettings>>(row.settings, {}) },
    addresses: parse<Address[]>(row.addresses, []),
    favorites: parse<(string | number)[]>(row.favorites, []),
    ...(row.friend_id ? { friendId: row.friend_id } : {}),
    walletBalance: row.wallet_balance ?? 0,
    bananaBalance: row.banana_balance ?? 0,
    bananaLocked: row.banana_locked ?? 0,
    createdAt: row.created_at,
  };
}

async function upsertUserRow(user: User) {
  await d1Execute(
    `INSERT INTO users (id, name, username, member_no, email, email_verified_at, phone, phone_verified_at, password_hash, avatar,
       gender, birth_date, preferred_genres, profile_completed_at, is_admin, provider,
       provider_id, settings, addresses, favorites, friend_id, wallet_balance, banana_balance, banana_locked, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, username = excluded.username, member_no = excluded.member_no,
       email = excluded.email, email_verified_at = excluded.email_verified_at,
       phone = excluded.phone,
       phone_verified_at = excluded.phone_verified_at,
       password_hash = excluded.password_hash, avatar = excluded.avatar,
       gender = excluded.gender, birth_date = excluded.birth_date,
       preferred_genres = excluded.preferred_genres,
       profile_completed_at = excluded.profile_completed_at,
       is_admin = excluded.is_admin, provider = excluded.provider,
       provider_id = excluded.provider_id, settings = excluded.settings,
        addresses = excluded.addresses, favorites = excluded.favorites,
        friend_id = excluded.friend_id,
        wallet_balance = excluded.wallet_balance,
        banana_balance = excluded.banana_balance,
        banana_locked = excluded.banana_locked`,
    user.id,
    user.name,
    user.username ?? null,
    user.memberNo ?? null,
    user.email,
    user.emailVerifiedAt ?? null,
    user.phone ?? null,
    user.phoneVerifiedAt ?? null,
    user.passwordHash,
    user.avatar ?? null,
    user.gender ?? null,
    user.birthDate ?? null,
    JSON.stringify(user.preferredGenres ?? []),
    user.profileCompletedAt ?? null,
    user.isAdmin ? 1 : 0,
    user.provider ?? "password",
    user.providerId ?? null,
    JSON.stringify(user.settings),
    JSON.stringify(user.addresses),
    JSON.stringify(user.favorites),
    user.friendId ?? null,
    user.walletBalance ?? 0,
    user.bananaBalance ?? 0,
    user.bananaLocked ?? 0,
    user.createdAt,
  );
  return user;
}

export async function getUsers(): Promise<User[]> {
  if (await d1Ready()) {
    const rows = await d1All<UserRow>(`SELECT * FROM users ORDER BY created_at ASC`);
    return rows.map(rowToUser);
  }
  return readJson<User[]>(USERS_KEY, []);
}

export async function countUsers(): Promise<number> {
  if (await d1Ready()) {
    const row = await d1First<{ total: number }>(`SELECT COUNT(*) AS total FROM users`);
    return Number(row?.total ?? 0);
  }
  return (await getUsers()).length;
}

export function toPublicUser(user: User): PublicUser {
  const { passwordHash: _passwordHash, providerId: _providerId, ...rest } = user;
  return rest;
}

export async function findUserByEmail(email: string): Promise<User | undefined> {
  const normalized = email.trim().toLowerCase();
  if (await d1Ready()) {
    const row = await d1First<UserRow>(`SELECT * FROM users WHERE email = ?`, normalized);
    return row ? rowToUser(row) : undefined;
  }
  return (await getUsers()).find((u) => u.email.toLowerCase() === normalized);
}

export async function findUserById(id: string): Promise<User | undefined> {
  if (await d1Ready()) {
    const row = await d1First<UserRow>(`SELECT * FROM users WHERE id = ?`, id);
    return row ? rowToUser(row) : undefined;
  }
  return (await getUsers()).find((u) => u.id === id);
}

export async function findUserByPhone(phone: string): Promise<User | undefined> {
  const norm = normalizePhone(phone);
  const clean = phone.replace(/[^\d+]/g, "");
  if (await d1Ready()) {
    const row = await d1First<UserRow>(
      `SELECT * FROM users WHERE phone = ? OR phone = ? OR phone = ? LIMIT 1`,
      phone,
      norm || phone,
      clean,
    );
    return row ? rowToUser(row) : undefined;
  }
  return (await getUsers()).find(
    (u) => u.phone && (u.phone === phone || u.phone === norm || arePhonesEqual(u.phone, phone)),
  );
}

export async function findUserByUsername(username: string): Promise<User | undefined> {
  const normalized = username.trim().toLowerCase().replace(/^@/, "");
  if (!normalized) return undefined;
  if (await d1Ready()) {
    const row = await d1First<UserRow>(`SELECT * FROM users WHERE lower(username) = ?`, normalized);
    return row ? rowToUser(row) : undefined;
  }
  return (await getUsers()).find((u) => (u.username ?? "").toLowerCase() === normalized);
}

export async function findUserByMemberNo(memberNo: string): Promise<User | undefined> {
  const normalized = memberNo.trim().replace(/\D/g, "");
  if (!normalized) return undefined;
  if (await d1Ready()) {
    const row = await d1First<UserRow>(`SELECT * FROM users WHERE member_no = ?`, normalized);
    return row ? rowToUser(row) : undefined;
  }
  return (await getUsers()).find((u) => u.memberNo === normalized);
}

/**
 * Try one lookup without letting it take the whole sign-in down.
 *
 * `member_no` and `username` are columns added by a schema patch. On a database
 * where that patch never landed the query fails with "no such column", and a
 * single unusable lookup used to turn every sign-in — including ones by email
 * or phone that would have succeeded — into a bare `server_error`.
 */
async function tryLookup(
  label: string,
  lookup: () => Promise<User | undefined>,
): Promise<User | undefined> {
  try {
    return await lookup();
  } catch (error) {
    console.error(`[auth:lookup] ${label} unavailable:`, (error as Error).message);
    return undefined;
  }
}

/** Sign-in accepts a username, a phone number, an email or a membership number. */
export async function findUserByIdentifier(identifier: string): Promise<User | undefined> {
  const trimmed = identifier.trim();
  if (!trimmed) return undefined;
  if (trimmed.includes("@") && !trimmed.startsWith("@")) return findUserByEmail(trimmed);

  const digitsOnly = /^[\d\s+\-()]+$/.test(trimmed);
  if (digitsOnly) {
    const phone = normalizePhone(trimmed);
    if (phone) {
      const byPhone = await tryLookup("phone", () => findUserByPhone(phone));
      if (byPhone) return byPhone;
    }
    const byMember = await tryLookup("member_no", () => findUserByMemberNo(trimmed));
    if (byMember) return byMember;
  }

  const byUsername = await tryLookup("username", () => findUserByUsername(trimmed));
  if (byUsername) return byUsername;

  return tryLookup("email", () => findUserByEmail(trimmed));
}

/** banan + short random suffix, guaranteed free. */
export async function generateUsername(): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 5);
    const candidate = `banan${suffix}`;
    if (!(await findUserByUsername(candidate))) return candidate;
  }
  return `banan${Date.now().toString(36)}`;
}

/** Sequential membership numbers starting at 10001 (custom ones sold later). */
export async function nextMemberNo(): Promise<string> {
  const base = 10001 + (await countUsers());
  for (let candidate = base; candidate < base + 200; candidate += 1) {
    if (!(await findUserByMemberNo(String(candidate)))) return String(candidate);
  }
  return String(Date.now()).slice(-8);
}

export async function setUserPassword(id: string, password: string) {
  const passwordHash = await hashPassword(password);
  return updateUser(id, (user) => ({ ...user, passwordHash }));
}

export class PhoneAlreadyVerifiedError extends Error {
  constructor() {
    super("PHONE_ALREADY_VERIFIED");
    this.name = "PhoneAlreadyVerifiedError";
  }
}

/**
 * Attach a phone only after its OTP has been accepted.
 *
 * Failed/incomplete registrations may leave an unverified row holding the
 * unique phone value. A signed-in OAuth account that proves ownership of that
 * phone is allowed to reclaim it, while a verified account can never be
 * displaced. The D1 batch makes the release + claim atomic.
 */
export async function setPhoneVerified(id: string, phone: string) {
  const current = await findUserById(id);
  if (!current) return undefined;
  const existing = await findUserByPhone(phone);
  if (existing && existing.id !== id && existing.phoneVerifiedAt) {
    throw new PhoneAlreadyVerifiedError();
  }

  const verifiedAt = new Date().toISOString();
  if (await d1Ready()) {
    const statements: { sql: string; params: unknown[] }[] = [];
    if (existing && existing.id !== id) {
      statements.push({
        sql: `UPDATE users SET phone = NULL, phone_verified_at = NULL
              WHERE id = ? AND phone = ? AND phone_verified_at IS NULL`,
        params: [existing.id, phone],
      });
    }
    statements.push({
      sql: `UPDATE users SET phone = ?, phone_verified_at = ? WHERE id = ?`,
      params: [phone, verifiedAt, id],
    });
    try {
      await d1Batch(statements);
    } catch (error) {
      // A concurrent verification may have claimed the number between the
      // read and the batch. Report a stable conflict instead of server_error.
      if (/unique|constraint/i.test(error instanceof Error ? error.message : String(error))) {
        throw new PhoneAlreadyVerifiedError();
      }
      throw error;
    }
    return findUserById(id);
  }

  const users = await getUsers();
  const conflict = users.find(
    (user) => user.phone === phone && user.id !== id && Boolean(user.phoneVerifiedAt),
  );
  if (conflict) throw new PhoneAlreadyVerifiedError();
  let updated: User | undefined;
  const next = users.map((user) => {
    if (user.id === id) {
      updated = { ...user, phone, phoneVerifiedAt: verifiedAt };
      return updated;
    }
    if (user.phone === phone && !user.phoneVerifiedAt) {
      const { phone: _phone, phoneVerifiedAt: _phoneVerifiedAt, ...rest } = user;
      return rest as User;
    }
    return user;
  });
  await writeJson(USERS_KEY, next);
  return updated;
}

/** Promote only after a provider/OTP has verified the supplied owner identity. */
export async function ensureOwnerAdmin(
  user: User,
  verifiedIdentity: { email?: string; phone?: string },
): Promise<User> {
  if (user.isAdmin) return user;
  if (!isOwnerAccount(verifiedIdentity)) return user;
  const updated = await updateUser(user.id, (current) => ({ ...current, isAdmin: true }));
  return updated ?? { ...user, isAdmin: true };
}

export async function createUser(input: {
  name: string;
  email: string;
  emailVerifiedAt?: string;
  phone?: string;
  phoneVerifiedAt?: string;
  password?: string;
  isAdmin?: boolean;
  provider?: User["provider"];
  providerId?: string;
  avatar?: string;
}): Promise<User> {
  const email = input.email.trim().toLowerCase();
  const user: User = {
    id: randomId("usr"),
    name: input.name || randomDisplayName(),
    username: await generateUsername(),
    memberNo: await nextMemberNo(),
    email,
    ...(input.emailVerifiedAt ? { emailVerifiedAt: input.emailVerifiedAt } : {}),
    ...(input.phone ? { phone: input.phone } : {}),
    ...(input.phoneVerifiedAt ? { phoneVerifiedAt: input.phoneVerifiedAt } : {}),
    passwordHash: input.password ? await hashPassword(input.password) : "",
    avatar: input.avatar || randomAvatar(),
    gender: "unspecified",
    preferredGenres: [],
    // The caller must have completed a provider/OTP ownership proof before it
    // may request administrator rights. Merely typing an owner identity is
    // never sufficient.
    isAdmin: input.isAdmin === true,

    provider: input.provider ?? "password",
    ...(input.providerId ? { providerId: input.providerId } : {}),
    settings: { ...defaultSettings },
    addresses: [],
    favorites: [],
    walletBalance: 0,
    createdAt: new Date().toISOString(),
  };

  if (await d1Ready()) return upsertUserRow(user);
  const users = await getUsers();
  await writeJson(USERS_KEY, [...users, user]);
  return user;
}

export async function updateUser(
  id: string,
  mutate: (user: User) => User,
): Promise<User | undefined> {
  if (await d1Ready()) {
    const current = await findUserById(id);
    if (!current) return undefined;
    return upsertUserRow(mutate(current));
  }
  const users = await getUsers();
  let updated: User | undefined;
  const next = users.map((user) => {
    if (user.id !== id) return user;
    updated = mutate(user);
    return updated;
  });
  await writeJson(USERS_KEY, next);
  return updated;
}

/** Sign in with Google / Apple: link by provider id, then by email, else create. */
export async function findOrCreateOAuthUser(profile: {
  provider: "google" | "apple";
  providerId: string;
  email: string;
  name: string;
  avatar?: string;
}): Promise<User> {
  const now = new Date().toISOString();
  let user: User | undefined;

  if (await d1Ready()) {
    const linked = await d1First<UserRow>(
      `SELECT * FROM users WHERE provider = ? AND provider_id = ?`,
      profile.provider,
      profile.providerId,
    );
    if (linked) {
      const u = rowToUser(linked);
      if (!u.emailVerifiedAt) {
        await updateUser(u.id, (prev) => ({ ...prev, emailVerifiedAt: now }));
        u.emailVerifiedAt = now;
      }
      user = await ensureOwnerAdmin(u, { email: profile.email });
    }
  }

  if (!user) {
    const existing = await findUserByEmail(profile.email);
    if (existing) {
      const updated = await updateUser(existing.id, (u) => ({
        ...u,
        provider: profile.provider,
        providerId: profile.providerId,
        emailVerifiedAt: u.emailVerifiedAt || now,
        ...(u.avatar ? {} : profile.avatar ? { avatar: profile.avatar } : {}),
      }));
      user = await ensureOwnerAdmin(updated ?? existing, { email: profile.email });
    } else {
      user = await createUser({
        name: profile.name,
        email: profile.email,
        emailVerifiedAt: now,
        provider: profile.provider,
        providerId: profile.providerId,
        ...(profile.avatar ? { avatar: profile.avatar } : {}),
        isAdmin: isOwnerAccount({ email: profile.email }),
      });
    }
  }

  // Auto-claim legacy accounts matching verified OAuth email (Idempotent retry for all OAuth logins)
  if (user && user.email) {
    try {
      const { claimLegacyAccount } = await import("./legacy-claim.server");
      await claimLegacyAccount({
        userId: user.id,
        email: user.email,
        claimType: profile.provider === "google" ? "oauth_google" : "oauth_apple",
      });
    } catch (claimErr) {
      console.error("[OAuth] legacy claim check error:", claimErr);
    }
  }

  return user;
}

/* --------------------------------- orders --------------------------------- */

export function orderKey(id: string) {
  return `orders/${id}.json`;
}

export async function getOrder(id: string): Promise<Order | undefined> {
  if (await d1Ready()) {
    const row = await d1First<{ doc: string }>(`SELECT doc FROM orders WHERE id = ?`, id);
    return row ? parse<Order | undefined>(row.doc, undefined) : undefined;
  }
  return readJson<Order | undefined>(orderKey(id), undefined);
}

export async function listOrders(limit?: number): Promise<Order[]> {
  if (await d1Ready()) {
    const rows =
      limit && limit > 0
        ? await d1All<{ doc: string }>(
            `SELECT doc FROM orders ORDER BY created_at DESC LIMIT ?`,
            limit,
          )
        : await d1All<{ doc: string }>(`SELECT doc FROM orders ORDER BY created_at DESC`);
    return rows.map((r) => parse<Order>(r.doc, {} as Order));
  }
  const ids = await readJson<string[]>(ORDER_INDEX_KEY, []);
  const orders = await Promise.all(ids.map((id) => getOrder(id)));
  const all = orders.filter((o): o is Order => !!o);
  return limit && limit > 0 ? all.slice(0, limit) : all;
}

/**
 * A member's own orders, resolved by the `orders_user_idx` index.
 *
 * The member-facing screens used to call listOrders() and filter in JS, which
 * pulled every order in the database into the isolate and JSON-parsed all of
 * them just to show one customer their handful of purchases.
 */
export async function listOrdersByUser(userId: string, limit = 200): Promise<Order[]> {
  if (await d1Ready()) {
    const rows = await d1All<{ doc: string }>(
      `SELECT doc FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
      userId,
      limit,
    );
    return rows.map((r) => parse<Order>(r.doc, {} as Order));
  }
  const all = await listOrders();
  return all.filter((order) => order.userId === userId).slice(0, limit);
}

export async function saveOrder(order: Order): Promise<Order> {
  if (await d1Ready()) {
    await d1Execute(
      `INSERT INTO orders (id, code, user_id, doc, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET code = excluded.code, user_id = excluded.user_id,
         doc = excluded.doc, updated_at = excluded.updated_at`,
      order.id,
      order.code,
      order.userId,
      JSON.stringify(order),
      order.createdAt,
      order.updatedAt,
    );
    return order;
  }
  await writeJson(orderKey(order.id), order);
  await mutateJson<string[]>(ORDER_INDEX_KEY, [], (ids) =>
    ids.includes(order.id) ? ids : [order.id, ...ids],
  );
  return order;
}

/* --------------------------------- threads -------------------------------- */

function normalizeThread(thread: Thread): Thread {
  if (!thread.chatType) {
    if (thread.orderId) {
      thread.chatType = "ORDER_SUPPORT";
    } else if (thread.mode === "AI_ACTIVE") {
      thread.chatType = "AUTOMATED_SUPPORT";
    } else {
      thread.chatType = "GENERAL_SUPPORT";
    }
  }
  return thread;
}

export async function getThread(id: string): Promise<Thread | undefined> {
  if (await d1Ready()) {
    const row = await d1First<{ doc: string }>(`SELECT doc FROM threads WHERE id = ?`, id);
    const parsed = row ? parse<Thread | undefined>(row.doc, undefined) : undefined;
    return parsed ? normalizeThread(parsed) : undefined;
  }
  const parsed = await readJson<Thread | undefined>(`threads/${id}.json`, undefined);
  return parsed ? normalizeThread(parsed) : undefined;
}

export async function listThreads(): Promise<Thread[]> {
  if (await d1Ready()) {
    const rows = await d1All<{ doc: string }>(
      `SELECT doc FROM threads ORDER BY last_message_at DESC`,
    );
    return rows.map((r) => normalizeThread(parse<Thread>(r.doc, {} as Thread)));
  }
  const ids = await readJson<string[]>(THREAD_INDEX_KEY, []);
  const threads = await Promise.all(ids.map((id) => getThread(id)));
  return threads.filter((t): t is Thread => !!t).map(normalizeThread);
}

/** Threads owned by a single user — scoped at the query level, never filtered client-side. */
export async function listThreadsByUser(userId: string): Promise<Thread[]> {
  if (!userId) return [];
  if (await d1Ready()) {
    const rows = await d1All<{ doc: string }>(
      `SELECT doc FROM threads WHERE user_id = ? ORDER BY last_message_at DESC`,
      userId,
    );
    return rows.map((r) => normalizeThread(parse<Thread>(r.doc, {} as Thread)));
  }
  const all = await listThreads();
  return all.filter((t) => t.userId === userId);
}

export async function saveThread(thread: Thread): Promise<Thread> {
  const norm = normalizeThread(thread);
  if (await d1Ready()) {
    await d1Execute(
      `INSERT INTO threads (id, user_id, order_id, doc, last_message_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET doc = excluded.doc, last_message_at = excluded.last_message_at`,
      norm.id,
      norm.userId,
      norm.orderId ?? null,
      JSON.stringify(norm),
      norm.lastMessageAt,
    );
    return norm;
  }
  await writeJson(`threads/${norm.id}.json`, norm);
  await mutateJson<string[]>(THREAD_INDEX_KEY, [], (ids) =>
    ids.includes(norm.id) ? ids : [norm.id, ...ids],
  );
  return norm;
}

/* -------------------------------- messages -------------------------------- */

export interface PaginatedMessagesResult {
  messages: ChatMessage[];
  hasMore: boolean;
  nextCursor: string | null;
  totalCount: number;
}

export interface SearchMessageResult {
  id: string;
  senderRole: string;
  senderName?: string;
  kind: string;
  createdAt: string;
  snippet: string;
  fullText?: string;
}

export function normalizeSearchText(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "") // remove tashkeel
    .replace(/[إأآٱ]/g, "ا") // normalize alef
    .replace(/ة/g, "ه") // normalize taa marbuta
    .replace(/[ىي]/g, "ي") // normalize yaa
    .replace(/ـ/g, "") // remove tatweel
    .replace(/\s+/g, " ")
    .trim();
}

export async function getMessages(threadId: string): Promise<ChatMessage[]> {
  if (await d1Ready()) {
    const rows = await d1All<{ doc: string }>(
      `SELECT doc FROM messages WHERE thread_id = ? ORDER BY created_at ASC`,
      threadId,
    );
    return rows.map((r) => parse<ChatMessage>(r.doc, {} as ChatMessage));
  }
  return readJson<ChatMessage[]>(`messages/${threadId}.json`, []);
}

export async function getPaginatedMessages(
  threadId: string,
  options?: { limit?: number; before?: string; around?: string },
): Promise<PaginatedMessagesResult> {
  const limit = Math.min(Math.max(Number(options?.limit) || 10, 1), 50);

  if (!(await d1Ready())) {
    // Fallback to memory for non-D1 environments
    const all = await getMessages(threadId);
    const totalCount = all.length;
    let eligible = all;

    if (options?.around) {
      const targetIdx = all.findIndex((m) => m.id === options.around);
      if (targetIdx !== -1) {
        const half = Math.floor(limit / 2);
        const start = Math.max(0, targetIdx - half);
        const end = Math.min(all.length, start + limit);
        const slice = all.slice(start, end);
        const oldest = slice[0];
        const hasMore = start > 0;
        return {
          messages: slice,
          hasMore,
          nextCursor:
            oldest && hasMore
              ? btoa(JSON.stringify({ createdAt: oldest.createdAt, id: oldest.id }))
              : null,
          totalCount,
        };
      }
    }

    if (options?.before) {
      let beforeTime = "";
      let beforeId = "";
      try {
        const decoded = JSON.parse(atob(options.before));
        beforeTime = decoded.createdAt;
        beforeId = decoded.id;
      } catch {
        // Fallback for old cursor format
        const parts = options.before.split("_");
        beforeTime = parts[0] || "";
        beforeId = parts[1] || "";
      }

      eligible = all.filter((m) => {
        if (m.createdAt < beforeTime) return true;
        if (m.createdAt === beforeTime && beforeId && m.id < beforeId) return true;
        return false;
      });
    }

    const slice = eligible.slice(-limit);
    const hasMore = eligible.length > limit;
    const oldest = slice[0];

    return {
      messages: slice,
      hasMore,
      nextCursor:
        oldest && hasMore
          ? btoa(JSON.stringify({ createdAt: oldest.createdAt, id: oldest.id }))
          : null,
      totalCount,
    };
  }

  // D1 Path
  const countRes = await d1First<{ count: number }>(
    `SELECT COUNT(*) as count FROM messages WHERE thread_id = ?`,
    threadId,
  );
  const totalCount = countRes?.count || 0;

  if (options?.around) {
    // Find the around message to get its created_at
    const aroundMsg = await d1First<{ created_at: string; id: string }>(
      `SELECT created_at, id FROM messages WHERE thread_id = ? AND id = ?`,
      threadId,
      options.around,
    );

    if (aroundMsg) {
      const half = Math.floor(limit / 2);

      // Fetch messages around this timestamp
      const rows = await d1All<{ doc: string; created_at: string; id: string }>(
        `SELECT doc, created_at, id FROM (
           SELECT doc, created_at, id FROM messages WHERE thread_id = ? AND (created_at > ? OR (created_at = ? AND id >= ?)) ORDER BY created_at ASC, id ASC LIMIT ?
         )
         UNION
         SELECT doc, created_at, id FROM (
           SELECT doc, created_at, id FROM messages WHERE thread_id = ? AND (created_at < ? OR (created_at = ? AND id < ?)) ORDER BY created_at DESC, id DESC LIMIT ?
         )
         ORDER BY created_at ASC, id ASC`,
        threadId,
        aroundMsg.created_at,
        aroundMsg.created_at,
        aroundMsg.id,
        limit - half,
        threadId,
        aroundMsg.created_at,
        aroundMsg.created_at,
        aroundMsg.id,
        half,
      );

      const slice = rows.map((r) => parse<ChatMessage>(r.doc, {} as ChatMessage));
      const oldest = slice[0];
      const hasMore = Boolean(
        totalCount > slice.length &&
        oldest &&
        (oldest.id !== aroundMsg.id || slice.length === limit),
      );

      return {
        messages: slice,
        hasMore,
        nextCursor:
          oldest && hasMore
            ? btoa(JSON.stringify({ createdAt: oldest.createdAt, id: oldest.id }))
            : null,
        totalCount,
      };
    }
  }

  let query = `SELECT doc FROM messages WHERE thread_id = ?`;
  const params: any[] = [threadId];

  if (options?.before) {
    let beforeTime = "";
    let beforeId = "";
    try {
      const decoded = JSON.parse(atob(options.before));
      beforeTime = decoded.createdAt;
      beforeId = decoded.id;
    } catch {
      const parts = options.before.split("_");
      beforeTime = parts[0] || "";
      beforeId = parts[1] || "";
    }

    query += ` AND (created_at < ? OR (created_at = ? AND id < ?))`;
    params.push(beforeTime, beforeTime, beforeId);
  }

  // Fetch exactly limit + 1 to know if there's more
  query += ` ORDER BY created_at DESC, id DESC LIMIT ?`;
  params.push(limit + 1);

  const rows = await d1All<{ doc: string }>(query, ...params);
  const hasMore = rows.length > limit;
  const fetchedRows = hasMore ? rows.slice(0, limit) : rows;

  // They are ordered DESC in SQL, we need them ASC for the chat UI
  fetchedRows.reverse();

  const slice = fetchedRows.map((r) => parse<ChatMessage>(r.doc, {} as ChatMessage));
  const oldest = slice[0];

  return {
    messages: slice,
    hasMore,
    nextCursor:
      oldest && hasMore
        ? btoa(JSON.stringify({ createdAt: oldest.createdAt, id: oldest.id }))
        : null,
    totalCount,
  };
}

export async function searchMessagesInThread(
  threadId: string,
  query: string,
  limit = 20,
): Promise<SearchMessageResult[]> {
  const cleanQ = normalizeSearchText(query);
  if (!cleanQ) return [];

  let rows = [];
  if (await d1Ready()) {
    // If we have D1, we can just grab the docs, we don't need to load the whole JSON into memory array first,
    // but without FTS we still have to parse and search in JS.
    // However, fetching them from DB limits memory to just the serialized strings initially.
    const res = await d1All<{ doc: string }>(
      `SELECT doc FROM messages WHERE thread_id = ? ORDER BY created_at DESC`,
      threadId,
    );
    rows = res.map((r) => parse<ChatMessage>(r.doc, {} as ChatMessage));
  } else {
    rows = [...(await getMessages(threadId))].reverse();
  }

  const results: SearchMessageResult[] = [];

  for (const msg of rows) {
    if (msg.kind === "item_credentials" || msg.kind === "item_verification_code") {
      continue;
    }

    const text = typeof msg.body["text"] === "string" ? msg.body["text"] : "";
    if (!text) continue;

    const normText = normalizeSearchText(text);
    if (normText.includes(cleanQ)) {
      // Find position in raw text approximately
      const matchIdx = normText.indexOf(cleanQ);
      const start = Math.max(0, matchIdx - 30);
      const end = Math.min(text.length, matchIdx + cleanQ.length + 40);
      const snippet =
        (start > 0 ? "..." : "") + text.slice(start, end).trim() + (end < text.length ? "..." : "");

      results.push({
        id: msg.id,
        senderRole: msg.senderRole,
        senderName: msg.senderName,
        kind: msg.kind,
        createdAt: msg.createdAt,
        snippet,
        // intentional omission of fullText to avoid leaking passwords in search payload
      });

      if (results.length >= limit) break;
    }
  }

  return results;
}

export async function appendMessage(
  threadId: string,
  message: Partial<ChatMessage> & { clientMessageId?: string },
): Promise<ChatMessage> {
  const clientMessageId = message.clientMessageId;
  const body = { ...(message.body || {}) };
  if (clientMessageId) {
    body["clientMessageId"] = clientMessageId;
  }

  const full: ChatMessage = {
    id: message.id || randomId("msg"),
    threadId: message.threadId || threadId,
    senderRole: message.senderRole || "system",
    kind: message.kind || "text",
    body,
    createdAt: message.createdAt || new Date().toISOString(),
    ...(message.senderName ? { senderName: message.senderName } : {}),
  };

  if (await d1Ready()) {
    // Check idempotency first if clientMessageId is present
    if (clientMessageId) {
      const existingRow = await d1First<{ doc: string }>(
        `SELECT doc FROM messages WHERE thread_id = ? AND client_message_id = ?`,
        threadId,
        clientMessageId,
      );
      if (existingRow) {
        return parse<ChatMessage>(existingRow.doc, {} as ChatMessage);
      }
    }

    try {
      await d1Execute(
        `INSERT INTO messages (id, thread_id, doc, created_at, client_message_id) VALUES (?, ?, ?, ?, ?)`,
        full.id,
        threadId,
        JSON.stringify(full),
        full.createdAt,
        clientMessageId || null,
      );
    } catch (e: any) {
      if (clientMessageId && e.message?.includes("UNIQUE constraint failed")) {
        const existingRow = await d1First<{ doc: string }>(
          `SELECT doc FROM messages WHERE thread_id = ? AND client_message_id = ?`,
          threadId,
          clientMessageId,
        );
        if (existingRow) {
          return parse<ChatMessage>(existingRow.doc, {} as ChatMessage);
        }
      }
      throw e;
    }
  } else {
    await mutateJson<ChatMessage[]>(`messages/${threadId}.json`, [], (msgs) => [...msgs, full]);
  }

  // Broadcast realtime event
  try {
    const { chatRealtime } = await import("./chat-realtime.server");
    chatRealtime.broadcast(threadId, {
      type: "message.created",
      payload: { message: full, clientMessageId },
    });
  } catch {
    // Realtime hub fallback
  }

  // Notification: Chat Message
  const thread = await getThread(threadId);
  if (thread) {
    if (full.senderRole === "admin") {
      const user = await findUserById(thread.userId);
      if (user?.telegramId) {
        await sendTelegramMessage(
          user.telegramId,
          `💬 *رسالة جديدة من الدعم*\n\nفي محادثة: ${thread.subject}\n\n"${full.body["text"] || "أرسل صورة"}"`,
        );
      }
    }
  }

  return full;
}

/* ---------------------------------- wallet --------------------------------- */

export async function getWalletTransactions(userId: string): Promise<WalletTransaction[]> {
  if (await d1Ready()) {
    // Auto-repair legacy bugged banan code transactions with fractional amounts
    try {
      const bugged = await d1All<{
        id: string;
        user_id: string;
        amount: number;
        description: string;
      }>(
        `SELECT id, user_id, amount, description FROM wallet_transactions WHERE user_id = ? AND description LIKE 'Banan Code:% (% IQD)' AND amount < 500`,
        userId,
      );
      for (const tx of bugged) {
        const match = tx.description?.match(/\((\d+)\s*IQD\)/i);
        if (match && match[1]) {
          const correctAmount = Number(match[1]);
          if (correctAmount > 0 && tx.amount < correctAmount) {
            const diff = correctAmount - tx.amount;
            await d1Execute(
              `UPDATE wallet_transactions SET amount = ? WHERE id = ?`,
              correctAmount,
              tx.id,
            );
            await d1Execute(
              `UPDATE users SET wallet_balance = ROUND(COALESCE(wallet_balance, 0) + ?) WHERE id = ?`,
              diff,
              tx.user_id,
            );
          }
        }
      }
    } catch {
      // Ignore repair error if any
    }

    const rows = await d1All<any>(
      `SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC`,
      userId,
    );
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id || r.userId,
      kind: r.kind,
      amount: Number(r.amount) || 0,
      description: r.description || "",
      orderId: r.order_id || r.orderId || "",
      referenceType: r.reference_type || r.referenceType || "",
      referenceId: r.reference_id || r.referenceId || "",
      createdAt: r.created_at || r.createdAt || new Date().toISOString(),
    }));
  }
  return []; // Filesystem fallback omitted for brevity
}

export async function createWalletTransaction(
  tx: Omit<WalletTransaction, "id" | "createdAt">,
): Promise<WalletTransaction> {
  const full: WalletTransaction = {
    id: randomId("wtx"),
    createdAt: new Date().toISOString(),
    ...tx,
  };
  if (await d1Ready()) {
    await d1Execute(
      `INSERT INTO wallet_transactions (id, user_id, kind, amount, description, order_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      full.id,
      full.userId,
      full.kind,
      full.amount,
      full.description ?? null,
      full.orderId ?? null,
      full.createdAt,
    );
  }
  return full;
}

/**
 * Move money in or out of a wallet.
 *
 * The balance is changed with a single conditional `UPDATE ... SET
 * wallet_balance = wallet_balance + ?` rather than a read-modify-write, so two
 * concurrent requests can never both read the same starting balance and clobber
 * each other. Debits carry their own `wallet_balance >= ?` guard, which is what
 * makes overdrawing impossible even under a race. The ledger row is written in
 * the same D1 batch and is skipped (`WHERE changes() = 1`) when the balance
 * update did not apply, so the ledger can never record a transfer that did not
 * happen.
 */
export async function adjustUserWalletBalance(
  userId: string,
  amount: number,
  kind: WalletTransactionKind,
  description?: string,
  orderId?: string,
): Promise<User | undefined> {
  if (!Number.isFinite(amount)) throw new Error("invalid_amount");

  const user = await findUserById(userId);
  if (!user) return undefined;

  if (!(await d1Ready())) {
    // JSON fallback driver (local sandbox only): no transactions available.
    const newBalance = (user.walletBalance ?? 0) + amount;
    if (newBalance < 0 && amount < 0) throw new Error("Insufficient wallet balance");
    const updated = await updateUser(userId, (u) => ({ ...u, walletBalance: newBalance }));
    if (updated) {
      await createWalletTransaction({
        userId,
        amount,
        kind,
        description: description ?? `Wallet adjustment: ${kind}`,
        orderId: orderId ?? "",
      });
    }
    return updated;
  }

  const now = new Date().toISOString();
  const balanceSql =
    amount < 0
      ? `UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ? AND wallet_balance >= ?`
      : `UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?`;
  const balanceParams = amount < 0 ? [amount, userId, -amount] : [amount, userId];
  const ledgerParams = [
    randomId("wtx"),
    userId,
    kind,
    amount,
    description ?? `Wallet adjustment: ${kind}`,
    orderId ?? "",
    now,
  ];
  const ledgerSql = `INSERT INTO wallet_transactions (id, user_id, kind, amount, description, order_id, created_at)
            SELECT ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1`;

  const db = getD1();
  if (db?.batch) {
    const results = await d1Batch([
      { sql: balanceSql, params: balanceParams },
      { sql: ledgerSql, params: ledgerParams },
    ]);
    if (Number(results[0]?.meta?.changes ?? 0) !== 1) {
      throw new Error("Insufficient wallet balance");
    }
    return findUserById(userId);
  }

  // Driver without batch support: the guard still runs inside the single
  // UPDATE, so the balance stays correct; only the ledger row loses atomicity.
  const changed = await d1RunChanges(balanceSql, ...balanceParams);
  if (changed !== 1) throw new Error("Insufficient wallet balance");
  await d1Execute(
    `INSERT INTO wallet_transactions (id, user_id, kind, amount, description, order_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ...ledgerParams,
  );
  return findUserById(userId);
}

export async function createRechargeRequest(
  req: Omit<WalletRechargeRequest, "id" | "status" | "createdAt" | "updatedAt">,
): Promise<WalletRechargeRequest> {
  const full: WalletRechargeRequest = {
    id: randomId("rrq"),
    status: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...req,
  };
  if (await d1Ready()) {
    await d1Execute(
      `INSERT INTO recharge_requests (id, user_id, amount, method, proof_url, eshop_code, banan_code, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      full.id,
      full.userId,
      full.amount,
      full.method,
      full.proofUrl ?? null,
      full.eshopCode ?? null,
      full.bananCode ?? null,
      full.status,
      full.createdAt,
      full.updatedAt,
    );
  }
  return full;
}

export async function approveRechargeRequest(
  requestId: string,
  adminNotes?: string,
): Promise<boolean> {
  if (!(await d1Ready())) return false;

  const req = await d1First<WalletRechargeRequest>(
    `SELECT * FROM recharge_requests WHERE id = ?`,
    requestId,
  );
  if (!req || req.status !== "pending") return false;

  const now = new Date().toISOString();
  const claimed = await d1RunChanges(
    `UPDATE recharge_requests SET status = 'approved', admin_notes = ?, updated_at = ?
     WHERE id = ? AND status = 'pending'`,
    adminNotes ?? null,
    now,
    requestId,
  );
  if (claimed !== 1) return false;

  const store = await getStore();
  let finalAmount = req.amount;

  // Apply Nintendo Bonus if applicable
  if (req.method === "eshop_card") {
    const bonusEnabled = store.settings?.["nintendoBonusEnabled"] !== false;
    const bonusPercent = Number(store.settings?.["nintendoBonusPercent"] || 15);
    if (bonusEnabled) {
      finalAmount = req.amount * (1 + bonusPercent / 100);
    }
  }

  await adjustUserWalletBalance(
    req.userId,
    finalAmount,
    "deposit",
    `Recharge approved: ${req.method} (${requestId})${finalAmount > req.amount ? " + Bonus" : ""}`,
  );

  return true;
}

export async function rejectRechargeRequest(
  requestId: string,
  adminNotes?: string,
): Promise<boolean> {
  if (!(await d1Ready())) return false;

  const now = new Date().toISOString();
  await d1Execute(
    `UPDATE recharge_requests SET status = 'rejected', admin_notes = ?, updated_at = ? WHERE id = ?`,
    adminNotes ?? null,
    now,
    requestId,
  );

  return true;
}

export async function consumeBananCode(
  userId: string,
  rawCode: string,
): Promise<{ success: boolean; amount?: number; currency?: string; error?: string }> {
  const code = String(rawCode ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!code) return { success: false, error: "يرجى إدخال الكود" };

  const store = await getStore();
  const now = new Date().toISOString();

  if (await d1Ready()) {
    const bc = await d1First<{ id: string; code: string; value: number; is_used: number }>(
      `SELECT * FROM banan_codes WHERE UPPER(code) = ? AND is_used = 0`,
      code,
    );
    if (!bc) return { success: false, error: "كود غير صالح أو مستخدم مسبقاً" };

    const claimed = await d1RunChanges(
      `UPDATE banan_codes SET is_used = 1, used_by = ?, used_at = ?
       WHERE id = ? AND is_used = 0`,
      userId,
      now,
      bc.id,
    );
    if (claimed !== 1) return { success: false, error: "كود غير صالح أو مستخدم مسبقاً" };

    // Credit full amount directly in IQD (Iraqi Dinar)
    await adjustUserWalletBalance(
      userId,
      bc.value,
      "deposit",
      `كود بنانتو: ${bc.code} (${bc.value.toLocaleString("en-US")} د.ع)`,
    );

    // Reward user with bananas based on dinarPerBanana setting
    const dinarPerBanana = Number(store.settings?.["dinarPerBanana"] || 1000);
    if (dinarPerBanana > 0) {
      const bananasEarned = Math.floor(bc.value / dinarPerBanana);
      if (bananasEarned > 0) {
        await updateUser(userId, (u) => ({
          ...u,
          bananaBalance: (Number(u.bananaBalance) || 0) + bananasEarned,
        }));
      }
    }

    return { success: true, amount: bc.value, currency: "IQD" };
  }

  // Fallback storage when D1 is not active
  let targetCode: BananCode | undefined;
  await mutateJson<BananCode[]>("banan_codes.json", [], (list) => {
    return list.map((c) => {
      if (c.code.toUpperCase() === code && !c.isUsed) {
        targetCode = c;
        return {
          ...c,
          isUsed: true,
          usedBy: userId,
          usedAt: now,
        };
      }
      return c;
    });
  });

  if (!targetCode) {
    return { success: false, error: "كود غير صالح أو مستخدم مسبقاً" };
  }

  await adjustUserWalletBalance(
    userId,
    targetCode.value,
    "deposit",
    `كود بنانتو: ${targetCode.code} (${targetCode.value.toLocaleString("en-US")} د.ع)`,
  );

  const dinarPerBanana = Number(store.settings?.["dinarPerBanana"] || 1000);
  if (dinarPerBanana > 0) {
    const bananasEarned = Math.floor(targetCode.value / dinarPerBanana);
    if (bananasEarned > 0) {
      await updateUser(userId, (u) => ({
        ...u,
        bananaBalance: (Number(u.bananaBalance) || 0) + bananasEarned,
      }));
    }
  }

  return { success: true, amount: targetCode.value, currency: "IQD" };
}

export async function createBananCode(value: number): Promise<BananCode> {
  const codes = await createBananCodesBatch(value, 1);
  if (!codes[0]) {
    throw new Error("Failed to create BananCode");
  }
  return codes[0];
}

export async function createBananCodesBatch(value: number, count = 1): Promise<BananCode[]> {
  const effectiveCount = Math.max(1, Math.min(100, Math.floor(Number(count) || 1)));
  const codes: BananCode[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < effectiveCount; i++) {
    const rawSuffix = randomId("BANAN")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 7);
    const code = `BANAN${rawSuffix}`.slice(0, 12);
    codes.push({
      id: randomId("bc"),
      code,
      value,
      isUsed: false,
      createdAt: now,
    });
  }

  if (await d1Ready()) {
    for (const c of codes) {
      await d1Execute(
        `INSERT INTO banan_codes (id, code, value, is_used, created_at) VALUES (?, ?, ?, ?, ?)`,
        c.id,
        c.code,
        c.value,
        0,
        c.createdAt,
      );
    }
  } else {
    await mutateJson<BananCode[]>("banan_codes.json", [], (list) => [...codes, ...list]);
  }

  return codes;
}

export interface BananCodeDetail {
  id: string;
  code: string;
  value: number;
  isUsed: boolean;
  usedBy?: string;
  usedAt?: string;
  createdAt: string;
  usedByUser?: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    username?: string;
    memberNo?: string;
  } | null;
}

export async function listBananCodesWithDetails(): Promise<BananCodeDetail[]> {
  if (await d1Ready()) {
    const rows = await d1All<{
      id: string;
      code: string;
      value: number;
      is_used: number;
      used_by: string | null;
      used_at: string | null;
      created_at: string;
      user_name: string | null;
      user_email: string | null;
      user_phone: string | null;
      user_member_no: string | null;
      user_username: string | null;
    }>(
      `SELECT 
        bc.id,
        bc.code,
        bc.value,
        bc.is_used,
        bc.used_by,
        bc.used_at,
        bc.created_at,
        u.name as user_name,
        u.email as user_email,
        u.phone as user_phone,
        u.member_no as user_member_no,
        u.username as user_username
      FROM banan_codes bc
      LEFT JOIN users u ON u.id = bc.used_by
      ORDER BY bc.created_at DESC
      LIMIT 500`,
    );

    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      value: Number(r.value),
      isUsed: Boolean(r.is_used),
      usedBy: r.used_by ?? undefined,
      usedAt: r.used_at ?? undefined,
      createdAt: r.created_at,
      usedByUser: r.used_by
        ? {
            id: r.used_by,
            name: r.user_name || "مستخدم مسجل",
            email: r.user_email ?? undefined,
            phone: r.user_phone ?? undefined,
            username: r.user_username ?? undefined,
            memberNo: r.user_member_no ?? undefined,
          }
        : null,
    }));
  }

  // Fallback storage
  const rawCodes = await readJson<BananCode[]>("banan_codes.json", []);
  const users = await getUsers();
  const userMap = new Map(users.map((u) => [u.id, u]));

  return rawCodes.map((c) => {
    const u = c.usedBy ? userMap.get(c.usedBy) : undefined;
    return {
      id: c.id,
      code: c.code,
      value: Number(c.value),
      isUsed: Boolean(c.isUsed),
      usedBy: c.usedBy,
      usedAt: c.usedAt,
      createdAt: c.createdAt,
      usedByUser: c.usedBy
        ? {
            id: c.usedBy,
            name: u?.name || "مستخدم مسجل",
            email: u?.email,
            phone: u?.phone,
            username: u?.username,
            memberNo: u?.memberNo,
          }
        : null,
    };
  });
}

export async function deleteBananCode(id: string): Promise<boolean> {
  if (await d1Ready()) {
    const changes = await d1RunChanges(`DELETE FROM banan_codes WHERE id = ? AND is_used = 0`, id);
    return changes > 0;
  }
  let deleted = false;
  await mutateJson<BananCode[]>("banan_codes.json", [], (list) => {
    const item = list.find((c) => c.id === id);
    if (item && !item.isUsed) {
      deleted = true;
      return list.filter((c) => c.id !== id);
    }
    return list;
  });
  return deleted;
}

export async function listAllRechargeRequests(): Promise<(WalletRechargeRequest & { userName?: string })[]> {
  if (await d1Ready()) {
    const rows = await d1All<any>(`
      SELECT r.*, u.name as user_name 
      FROM recharge_requests r
      LEFT JOIN users u ON r.user_id = u.id
      ORDER BY r.created_at DESC
    `);
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      userName: r.user_name,
      amount: r.amount,
      method: r.method,
      proofUrl: r.proof_url,
      eshopCode: r.eshop_code,
      bananCode: r.banan_code,
      status: r.status,
      adminNotes: r.admin_notes,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }
  return [];
}

export async function listAllUsers(): Promise<User[]> {
  return getUsers();
}

export async function listUserTransactions(userId: string): Promise<WalletTransaction[]> {
  return getWalletTransactions(userId);
}

/* -------------------------------- preferences ------------------------------ */

export async function getUserPreferences(userId: string): Promise<any> {
  const row = await d1First<{ prefs_json: string }>(
    `SELECT prefs_json FROM user_preferences WHERE user_id = ?`,
    userId,
  );
  return row ? JSON.parse(row.prefs_json) : {};
}

export async function saveUserPreferences(userId: string, prefs: any): Promise<void> {
  const now = new Date().toISOString();
  await d1Execute(
    `INSERT INTO user_preferences (user_id, prefs_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET prefs_json = excluded.prefs_json, updated_at = excluded.updated_at`,
    userId,
    JSON.stringify(prefs),
    now,
  );
}

/* -------------------------------- activity --------------------------------- */

export async function logLogin(params: {
  userId: string;
  type: string;
  provider?: string;
  request: Request;
}) {
  const { userId, type, provider, request } = params;
  const { getRequestInfo } = await import("./activity.functions.server");
  const info = await getRequestInfo(request);

  await d1Execute(
    `INSERT INTO login_history (
      id, user_id, type, provider, device_info_json, ip_hash, region, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    randomId("log"),
    userId,
    type,
    provider || null,
    JSON.stringify({
      userAgent: info.userAgent,
      deviceType: info.deviceType,
      browser: info.browser,
      os: info.os,
    }),
    info.ipHash,
    null, // region could be added from cf-ipcountry if available
    new Date().toISOString(),
  );
}
