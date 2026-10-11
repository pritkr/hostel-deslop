import type { ServerEnv } from "#/lib/server-env";

declare module "cloudflare:workers" {
  export const env: ServerEnv;
}
