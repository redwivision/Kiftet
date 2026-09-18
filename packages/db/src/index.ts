import { Database as BunSQLiteDatabase } from "bun:sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { DatabaseConfig } from "./config";
import * as schema from "./schema";

// The migrations folder lives in this package's source. When the API is
// bundled (tsdown → apps/server/dist) this module is inlined, so
// "next to the module" no longer points at the SQL files — walk back to
// the repo root and resolve the source path instead.
function findMigrationsDir(): string {
	const candidates = [
		join(import.meta.dirname, "migrations"),
		join(import.meta.dirname, "../../../packages/db/src/migrations"),
		join(import.meta.dirname, "../../packages/db/src/migrations"),
	];
	const found = candidates.find(
		(dir) => existsSync(dir) && readdirSync(dir).some((file) => file.endsWith(".sql")),
	);
	if (!found) {
		throw new Error(
			`Migrations folder not found. Tried: ${candidates.join(", ")}`,
		);
	}
	return found;
}

export function createDb(env: DatabaseConfig) {
	const sqlite = new BunSQLiteDatabase(env.DATABASE_FILE);
	sqlite.exec("PRAGMA journal_mode = WAL;");
	sqlite.exec("PRAGMA foreign_keys = ON;");
	const db = drizzle(sqlite, { schema });

	const migrationsDir = findMigrationsDir();
	if (readdirSync(migrationsDir).some((file) => file.endsWith(".sql"))) {
		migrate(db, { migrationsFolder: migrationsDir });
	}
	return db;
}

export type Database = ReturnType<typeof createDb>;