import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { d1All, ensureSchema, getD1 } from "@/lib/d1.server";

export const getSchemaStatus = createServerFn({ method: "GET" }).handler(async () => {
  try {
    await ensureSchema();
    const db = getD1();
    if (!db) return { success: false, error: "No database connection" };

    const tables = await d1All<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table'",
    );

    const tableNames = tables.map((t) => t.name);
    const requiredTables = [
      "users",
      "orders",
      "game_extraction_jobs",
      "game_field_audits",
      "game_catalog",
    ];

    const missing = requiredTables.filter((t) => !tableNames.includes(t));

    return {
      success: true,
      tables: tableNames,
      missing,
      timestamp: new Date().toISOString(),
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});
