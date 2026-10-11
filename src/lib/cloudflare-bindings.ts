/**
 * Minimal structural types for the Cloudflare bindings this app uses.
 *
 * The project does not depend on `@cloudflare/workers-types`, and importing
 * `cloudflare:workers` for its types would pull the Workers runtime into the
 * client bundle. These interfaces describe only the members actually called —
 * Drizzle drives D1 and the photo routes drive R2 — so widening them is a
 * deliberate act rather than an accident of a full platform declaration.
 */

/**
 * A prepared D1 statement. Drizzle is the only caller and reads the result
 * shape it expects, so the members are declared to accept Drizzle's parameter
 * and result types rather than to describe a result this app can name — no
 * application code consumes a row directly.
 */
export type D1PreparedStatement = {
  bind(...values: never[]): D1PreparedStatement;
  all(): Promise<{ results: object[]; success: boolean; meta: { last_row_id?: number } }>;
  run(): Promise<{ success: boolean }>;
};

export type D1Database = {
  prepare(query: string): D1PreparedStatement;
  exec(query: string): Promise<{ count: number; duration: number }>;
};

export type R2PutOptions = {
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
};

export type R2ObjectBody = {
  body: ReadableStream | null;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
  httpMetadata?: { contentType?: string };
};

export type R2Bucket = {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | ReadableStream | string,
    options?: R2PutOptions,
  ): Promise<{ key: string } | null>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(key: string | string[]): Promise<void>;
};
