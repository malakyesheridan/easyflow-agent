import { readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';

async function runMigration() {
  const migrationFile = process.argv[2];
  
  if (!migrationFile) {
    console.error('Usage: tsx scripts/run-migration.ts <migration-file>');
    process.exit(1);
  }

  // Load DATABASE_URL from .env.local
  let databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    try {
      const envPath = join(process.cwd(), '.env.local');
      const envFile = readFileSync(envPath, 'utf-8');
      // Match DATABASE_URL with or without quotes, handle multiline values
      const lines = envFile.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('DATABASE_URL=')) {
          databaseUrl = trimmed.substring('DATABASE_URL='.length).trim();
          // Remove quotes if present
          if ((databaseUrl.startsWith('"') && databaseUrl.endsWith('"')) ||
              (databaseUrl.startsWith("'") && databaseUrl.endsWith("'"))) {
            databaseUrl = databaseUrl.slice(1, -1);
          }
          break;
        }
      }
    } catch (error) {
      console.error('Could not read .env.local file:', error);
    }
  }

  if (!databaseUrl) {
    console.error('DATABASE_URL is not set. Please check .env.local file.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
  });

  try {
    const migrationPath = join(process.cwd(), migrationFile);
    const sql = readFileSync(migrationPath, 'utf-8');
    
    console.log(`Running migration: ${migrationFile}`);
    await pool.query(sql);
    console.log('✅ Migration completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();

