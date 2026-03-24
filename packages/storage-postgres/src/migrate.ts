import { resolve } from 'path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

/**
 * Run Drizzle migrations on startup.
 *
 * Resolves the migrations folder relative to this file's compiled location
 * (dist/migrate.js → ../drizzle/), so it works regardless of CWD.
 */
export async function runMigrations(db: PostgresJsDatabase): Promise<void> {
  const migrationsFolder = resolve(__dirname, '..', 'drizzle');
  await migrate(db, { migrationsFolder });
}
