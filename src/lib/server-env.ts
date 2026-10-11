// Server-only env resolver. Never statically import "cloudflare:workers"
// (it breaks the client bundle) — always resolve lazily at request time.
import type { D1Database, R2Bucket } from "./cloudflare-bindings";

/**
 * The subset of the Worker environment this app actually binds. Keeping it
 * explicit (rather than `Record<string, unknown>`) means `getServerEnv()`
 * callers get real types, and a typo in a binding name is a compile error
 * instead of a silently-`undefined` lookup at request time.
 */
export type ServerEnv = {
  DB?: D1Database;
  PHOTOS?: R2Bucket;
  BETTER_AUTH_URL?: string;
  BETTER_AUTH_SECRET?: string;
};

type WorkersEnvModule = { env?: ServerEnv };

/**
 * Resolves the Worker env, or an empty object when running under plain Node
 * (local `vite dev` without the Workers runtime).
 */
export async function getServerEnv(): Promise<ServerEnv> {
  try {
    // The specifier is held in a variable on purpose. A literal
    // "cloudflare:workers" is statically analysed at build time and fails to
    // resolve, even with @vite-ignore, which breaks every server function that
    // touches the database. Indirecting it keeps the import opaque to the
    // bundler and lets the runtime resolve it (or the .catch swallow it).
    const spec = "cloudflare:workers";

    // SAFETY: the Workers runtime is the only thing that can resolve this
    // specifier, and it exports a single `env` object whose bindings are declared
    // in wrangler.jsonc. The .catch yields null when the runtime is absent, which
    // is the only case where this narrowing is not observably wrong, and callers
    // fall through to the local-dev path below.
    const mod = (await import(/* @vite-ignore */ spec).catch(() => null)) as
      | WorkersEnvModule
      | null;

    if (mod?.env && (mod.env.DB || mod.env.PHOTOS)) return mod.env;
  } catch {
    /* plain node dev without workers runtime */
  }

  // Local dev mirrors the Worker's globalThis bindings so the rest of the app
  // can treat both runtimes identically instead of branching per call site.
  // SAFETY: local dev installs these bindings on globalThis under the same names
  // the Worker uses, so reading them here observes only bindings this module's
  // own callers set. Both are read as the declared binding types and nothing else
  // is read from globalThis.
  const g = globalThis as Partial<ServerEnv>;
  const out: ServerEnv = {};

  if (g.DB) out.DB = g.DB;

  if (g.PHOTOS) out.PHOTOS = g.PHOTOS;

  return out;
}
