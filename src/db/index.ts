import { drizzle as drizzleD1, type DrizzleD1Database } from "drizzle-orm/d1";
import { drizzle as drizzleProxy } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";
import type { D1Database } from "../lib/cloudflare-bindings";

export type AppDb = DrizzleD1Database<typeof schema>;

/**
 * The bindings `getDb` needs in order to reach a database. It is structurally
 * the same shape as `ServerEnv`; declaring it here keeps `src/db` free of a
 * dependency on the request-time env resolver.
 */
export type ServerBindings = {
  DB?: D1Database;
  PHOTOS?: unknown;
  BETTER_AUTH_URL?: string;
  BETTER_AUTH_SECRET?: string;
};

let localDb: AppDb | null = null;

export async function getDb(env?: ServerBindings): Promise<AppDb> {
  if (env?.DB) return drizzleD1(env.DB, { schema });

  // SAFETY: local dev mirrors the D1 binding onto globalThis under the Worker's
  // own name, so the only property read here is the binding this module already
  // expects, and its shape is the declared D1Database.
  const g = globalThis as Partial<ServerBindings>;

  if (g.DB) return drizzleD1(g.DB, { schema });

  if (!localDb) localDb = await createLocalDb();

  return localDb;
}

/**
 * Local Node fallback for `vite dev` without the Workers runtime: better-sqlite3
 * driven through Drizzle's proxy driver, which presents the same async surface
 * as D1 so the rest of the app never branches on which runtime it is on.
 */
async function createLocalDb(): Promise<AppDb> {
  const { default: Database } = await import(/* @vite-ignore */ "better-sqlite3");
  const fs = await import(/* @vite-ignore */ "node:fs");
  const path = await import(/* @vite-ignore */ "node:path");
  const url = process.env.DATABASE_URL ?? "file:./.data/local.db";
  const file = url.startsWith("file:") ? url.slice(5) : url;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const driver = sqlite;

  const db = drizzleProxy(
    async (sqlText, params, method) => {
      const stmt = driver.prepare(sqlText);
      const bound = params ?? [];

      // better-sqlite3 is synchronous, so each branch is resolved immediately and
      // wrapped to match the driver's async callback contract. Drizzle performs
      // its own result mapping, so rows are forwarded unreshaped.
      if (method === "get") {
        const row = stmt.get(...bound);

        return { rows: row ? [row] : [] };
      }

      if (method === "all") return { rows: stmt.all(...bound) };

      const res = stmt.run(...bound);

      return { rows: [], lastInsertRowid: res.lastInsertRowid };
    },
    { schema },
  );

  return db;
}
