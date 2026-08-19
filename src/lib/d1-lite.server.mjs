import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { env } from "node:process";

/**
 * Lightweight D1 client for script environments.
 * Uses CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, and D1_DATABASE_ID.
 */
export async function getD1() {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const token = env.CLOUDFLARE_API_TOKEN;
  const databaseId = env.D1_DATABASE_ID || env.CLOUDFLARE_D1_DATABASE_ID;

  if (!accountId || !token || !databaseId) {
    return null;
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

  const execute = async (statements) => {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        batch: statements.map(({ sql, params }) => ({
          sql,
          params: params.map((p) => (p === undefined ? null : p)),
        })),
      }),
    });
    const payload = await res.json();
    if (!res.ok || payload.success === false) {
      const msg = payload.errors?.[0]?.message ?? `D1 REST error ${res.status}`;
      throw new Error(msg);
    }
    return payload.result ?? [];
  };

  return {
    all: async (sql, ...params) => {
      const result = await execute([{ sql, params }]);
      return result[0]?.results ?? [];
    },
    first: async (sql, ...params) => {
      const result = await execute([{ sql, params }]);
      return result[0]?.results?.[0] ?? null;
    },
    run: async (sql, ...params) => {
      await execute([{ sql, params }]);
    },
    batch: async (statements) => {
      return execute(statements);
    },
  };
}
