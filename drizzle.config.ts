import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: [".env.local", ".env", ".dev.vars"] });

// Drizzle Kit reads `dbCredentials` only when a database URL is configured; a
// local dev run without one still generates migrations, so the key is left off
// entirely rather than spread in conditionally.
const databaseUrl = process.env.DATABASE_URL;

const dbCredentials = databaseUrl ? { dbCredentials: { url: databaseUrl } } : {};

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "sqlite",
  ...dbCredentials,
});
