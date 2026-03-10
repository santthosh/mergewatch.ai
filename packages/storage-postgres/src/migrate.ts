import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

export async function runMigrations(db: PostgresJsDatabase): Promise<void> {
  await migrate(db, { migrationsFolder: './drizzle' });
}
