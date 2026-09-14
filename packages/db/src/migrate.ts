import { Database as BunSQLiteDatabase } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { readdirSync } from "node:fs";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import { ENV as env } from "./env";
import * as schema from "./schema";

const sqlite = new BunSQLiteDatabase(env.DATABASE_FILE);
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA foreign_keys = ON;");
const db = drizzle(sqlite, { schema });

const migrationsDir = new URL("./migrations", import.meta.url).pathname;
if (readdirSync(migrationsDir).some((file) => file.endsWith(".sql"))) {
  migrate(db, { migrationsFolder: migrationsDir });
}

console.log(`[kiftet:db] migrations applied -> ${env.DATABASE_FILE}`);