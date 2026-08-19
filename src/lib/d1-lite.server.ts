import { getEnv } from "./env.server.ts";

export function getD1(): any {
  const envData = getEnv();
  return envData["bananto"] || envData["DB"] || envData["BANANTO_DB"];
}

export async function d1First(sql: string, ...binds: any[]): Promise<any | undefined> {
  const db = getD1();
  if (!db || typeof db.prepare !== "function") return undefined;
  const prepared = db.prepare(sql);
  const out = await (binds.length ? prepared.bind(...binds) : prepared).first();
  return (out as any) || undefined;
}

export async function d1Run(sql: string, ...binds: any[]): Promise<void> {
  const db = getD1();
  if (!db || typeof db.prepare !== "function") return;
  const prepared = db.prepare(sql);
  await (binds.length ? prepared.bind(...binds) : prepared).run();
}
