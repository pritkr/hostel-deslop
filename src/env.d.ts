/// <reference types="vite/client" />

import type {
  D1Database,
  D1PreparedStatement,
  R2Bucket,
  R2ObjectBody,
  R2PutOptions,
} from "./lib/cloudflare-bindings";

// The Workers globals are declared structurally in ./lib/cloudflare-bindings so
// the same shapes are usable as ordinary imported types. Re-declaring them here
// as globals with `unknown` returns would shadow those and reintroduce the
// untyped-boundary problem, so they are simply forwarded instead.
declare global {
  interface CloudflareEnv {
    DB: D1Database;
    PHOTOS: R2Bucket;
    BETTER_AUTH_SECRET?: string;
    BETTER_AUTH_URL?: string;
    RESEND_API_KEY?: string;
  }
}

export type {
  D1Database,
  D1PreparedStatement,
  R2Bucket,
  R2ObjectBody,
  R2PutOptions,
};
