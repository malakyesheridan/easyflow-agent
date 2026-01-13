import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schemas from "@/db/schema";

type Db = NodePgDatabase<typeof schemas>;

// Lazy initialization - no top-level env access
let pool: Pool | null = null;
let dbInstance: Db | null = null;

/**
 * Get database connection pool (lazy initialization)
 * Throws error if DATABASE_URL is not set
 */
function getPool(): Pool {
  if (pool) return pool;

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    // Debug: Log all env vars that start with DATABASE to help diagnose
    const dbEnvVars = Object.keys(process.env)
      .filter(key => key.includes('DATABASE'))
      .map(key => `${key}=${process.env[key] ? 'SET' : 'NOT SET'}`);
    
    console.error('❌ DATABASE_URL is not set in process.env');
    console.error('Available DATABASE-related env vars:', dbEnvVars);
    console.error('Current working directory:', process.cwd());
    console.error('NODE_ENV:', process.env.NODE_ENV);
    
    throw new Error(
      "DATABASE_URL is not set. Ensure it exists in .env.local and restart the dev server."
    );
  }

  pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    max: 20,
  });

  pool.on("error", (err) => {
    console.error("Unexpected error on idle client", err);
    // Avoid killing the whole process (e.g., serverless runtimes). Let the platform recycle if needed.
  });

  return pool;
}

/**
 * Get Drizzle database instance (lazy initialization)
 * All database access must go through this function
 */
export function getDb(): Db {
  if (dbInstance) return dbInstance;

  dbInstance = drizzle(getPool(), {
    schema: schemas,
  }) as Db;

  return dbInstance;
}

// Export a proxy that calls getDb() on property access
// This ensures lazy initialization even when imported
// Supports nested property access (e.g., db.query.jobs)
export const db = new Proxy({} as Db, {
  get(_target, prop) {
    const dbInstance = getDb();
    const value = dbInstance[prop as keyof Db];
    
    // If the value is an object, wrap it in a proxy to support nested access
    if (value && typeof value === 'object' && prop !== 'then' && prop !== 'catch' && prop !== 'finally') {
      return new Proxy(value as any, {
        get(nestedTarget, nestedProp) {
          const nestedValue = (nestedTarget as any)[nestedProp];
          // Recursively wrap nested objects
          if (nestedValue && typeof nestedValue === 'object' && nestedProp !== 'then' && nestedProp !== 'catch' && nestedProp !== 'finally') {
            return new Proxy(nestedValue, {
              get(deepTarget, deepProp) {
                return (deepTarget as any)[deepProp];
              },
            });
          }
          return nestedValue;
        },
      });
    }
    
    return value;
  },
});
