import { existsSync, readFileSync, readdirSync } from "fs";
import { resolve } from "path";
import { Pool, type PoolConfig } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

function loadDatabaseUrl(): string {
  let databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    try {
      const envPath = resolve(process.cwd(), ".env.local");
      const envFile = readFileSync(envPath, "utf8");
      const match = envFile.match(/^DATABASE_URL=(.+)$/m);
      if (match) {
        databaseUrl = match[1].trim();
        if (
          (databaseUrl.startsWith("\"") && databaseUrl.endsWith("\"")) ||
          (databaseUrl.startsWith("'") && databaseUrl.endsWith("'"))
        ) {
          databaseUrl = databaseUrl.slice(1, -1);
        }
        process.env.DATABASE_URL = databaseUrl;
      }
    } catch {
      // Ignore missing .env.local
    }
  }

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set in env or .env.local");
  }

  return databaseUrl;
}

function resolveSsl(databaseUrl: string): PoolConfig["ssl"] | undefined {
  let sslMode: string | null = null;
  let hostname: string | null = null;

  try {
    const url = new URL(databaseUrl);
    sslMode = url.searchParams.get("sslmode");
    hostname = url.hostname;
  } catch {
    // If parsing fails, fall back to environment defaults.
  }

  const isSupabaseHost =
    hostname?.includes("supabase.co") ||
    hostname?.includes("supabase.com") ||
    hostname?.includes("pooler");

  const shouldUseSsl = sslMode ? sslMode !== "disable" : Boolean(isSupabaseHost);

  if (!shouldUseSsl) {
    return undefined;
  }

  return { rejectUnauthorized: false };
}

function assertMigrationsFolder(migrationsFolder: string): void {
  if (!existsSync(migrationsFolder)) {
    throw new Error(`Migrations folder not found: ${migrationsFolder}`);
  }

  const hasSql = readdirSync(migrationsFolder).some((file) =>
    file.toLowerCase().endsWith(".sql")
  );

  if (!hasSql) {
    throw new Error(`No SQL migrations found in: ${migrationsFolder}`);
  }
}

async function listTables(pool: Pool): Promise<void> {
  const sql = `
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname NOT IN ('pg_catalog','information_schema')
    ORDER BY schemaname, tablename;
  `;
  const result = await pool.query(sql);

  console.log("schemaname\ttablename");
  if (result.rows.length === 0) {
    console.log("(no rows)");
    return;
  }

  for (const row of result.rows) {
    console.log(`${row.schemaname}\t${row.tablename}`);
  }
}

async function main(): Promise<void> {
  const databaseUrl = loadDatabaseUrl();
  const migrationsFolder = resolve(process.cwd(), "db", "migrations");
  const tablesOnly = process.argv.includes("--tables-only");

  if (!tablesOnly) {
    assertMigrationsFolder(migrationsFolder);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: resolveSsl(databaseUrl),
    connectionTimeoutMillis: 10000,
    max: 2,
  });

  try {
    if (!tablesOnly) {
      const db = drizzle(pool);
      await migrate(db, { migrationsFolder });
    }

    await listTables(pool);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
