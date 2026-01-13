import type { Config } from "drizzle-kit";
import { readFileSync } from "fs";
import { join } from "path";

// Load DATABASE_URL from .env.local if not set in environment
let databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  try {
    const envPath = join(process.cwd(), ".env.local");
    const envFile = readFileSync(envPath, "utf-8");
    const match = envFile.match(/^DATABASE_URL=(.+)$/m);
    if (match) {
      databaseUrl = match[1].trim();
    }
  } catch (error) {
    // File doesn't exist or can't be read
  }
}

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

export default {
  schema: "./db/schema/*",
  out: "./db/migrations",
  driver: "pg",
  dbCredentials: {
    connectionString: databaseUrl,
  },
} satisfies Config;
