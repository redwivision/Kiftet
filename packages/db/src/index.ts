import { Database as BunSQLiteDatabase } from "bun:sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { readdirSync } from "node:fs";

import type { DatabaseConfig } from "./config";
import * as schema from "./schema";

export function createDb(env: DatabaseConfig) {
  const sqlite = new BunSQLiteDatabase(env.DATABASE_FILE);
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  const db = drizzle(sqlite, { schema });

  const migrationsDir = new URL("./migrations", import.meta.url).pathname;
  if (readdirSync(migrationsDir).some((file) => file.endsWith(".sql"))) {
    migrate(db, { migrationsFolder: migrationsDir });
  }
  return db;
}

export type Database = ReturnType<typeof createDb>;