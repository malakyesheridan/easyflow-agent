import { readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';

type ColumnInfo = {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
};

const TABLES: Record<string, string[]> = {
  users: ['id', 'email', 'name', 'password_hash', 'status', 'created_at', 'updated_at', 'last_login_at'],
  orgs: ['id', 'name', 'slug', 'created_at', 'updated_at'],
  org_roles: [
    'id',
    'org_id',
    'key',
    'name',
    'description',
    'capabilities',
    'is_default',
    'archived_at',
    'created_at',
    'updated_at',
  ],
  org_memberships: [
    'id',
    'org_id',
    'user_id',
    'role_id',
    'crew_member_id',
    'status',
    'created_at',
    'updated_at',
  ],
  org_invites: [
    'id',
    'org_id',
    'email',
    'role_id',
    'crew_member_id',
    'token_hash',
    'expires_at',
    'status',
    'created_by_user_id',
    'created_at',
    'updated_at',
  ],
  user_sessions: [
    'id',
    'user_id',
    'org_id',
    'token_hash',
    'impersonated_crew_member_id',
    'created_at',
    'last_seen_at',
    'revoked_at',
  ],
  org_settings: [
    'org_id',
    'company_name',
    'company_logo_path',
    'timezone',
    'default_workday_start_minutes',
    'default_workday_end_minutes',
    'default_daily_capacity_minutes',
    'travel_buffer_enabled',
    'announcements_enabled',
    'urgent_announcement_behavior',
    'vocabulary',
    'units',
    'kpi_units',
    'created_at',
    'updated_at',
  ],
  password_resets: [
    'id',
    'user_id',
    'token_hash',
    'requested_ip',
    'user_agent',
    'created_at',
    'expires_at',
    'used_at',
  ],
};

function loadDatabaseUrl(): string {
  let databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    const envPath = join(process.cwd(), '.env.local');
    const envFile = readFileSync(envPath, 'utf-8');
    const lines = envFile.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('DATABASE_URL=')) {
        databaseUrl = trimmed.substring('DATABASE_URL='.length).trim();
        if (
          (databaseUrl.startsWith('"') && databaseUrl.endsWith('"')) ||
          (databaseUrl.startsWith("'") && databaseUrl.endsWith("'"))
        ) {
          databaseUrl = databaseUrl.slice(1, -1);
        }
        break;
      }
    }
  }
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }
  return databaseUrl;
}

async function main() {
  const pool = new Pool({ connectionString: loadDatabaseUrl() });
  try {
    const tableList = Object.keys(TABLES).map((t) => `'${t}'`).join(',');
    const result = await pool.query<ColumnInfo>(
      `SELECT table_name, column_name, data_type, udt_name, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name IN (${tableList})
       ORDER BY table_name, ordinal_position;`
    );

    const byTable = new Map<string, ColumnInfo[]>();
    for (const row of result.rows) {
      if (!byTable.has(row.table_name)) {
        byTable.set(row.table_name, []);
      }
      byTable.get(row.table_name)!.push(row);
    }

    const missing: Record<string, string[]> = {};
    for (const [table, columns] of Object.entries(TABLES)) {
      const existing = new Set((byTable.get(table) || []).map((c) => c.column_name));
      const missingColumns = columns.filter((col) => !existing.has(col));
      if (missingColumns.length > 0) {
        missing[table] = missingColumns;
      }
    }

    console.log('Auth schema audit');
    for (const [table, columns] of Object.entries(TABLES)) {
      const existing = byTable.get(table) || [];
      console.log(`\n${table}`);
      if (existing.length === 0) {
        console.log('  - table not found');
        continue;
      }
      for (const col of existing) {
        console.log(`  - ${col.column_name} (${col.data_type}${col.udt_name && col.data_type === 'USER-DEFINED' ? ':' + col.udt_name : ''})`);
      }
      if (missing[table]) {
        console.log(`  Missing: ${missing[table].join(', ')}`);
      }
    }

    if (Object.keys(missing).length === 0) {
      console.log('\nNo missing columns detected.');
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Audit failed:', error);
  process.exit(1);
});
