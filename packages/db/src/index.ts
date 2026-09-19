import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

import type { DatabaseConfig } from "./config";
import * as schema from "./schema";

// kiftet runs on Neon Postgres. The pooled (-pooler) hostname is the app's
// connection; the unpooled/direct hostname is reserved for migrations, which
// need a session-stable connection the pool cannot guarantee. Neon requires
// TLS for every endpoint, so any non-local host connects over SSL regardless
// of whether the URL carries an explicit sslmode query param.
function sslFor(url: string) {
	try {
		const host = new URL(url).hostname;
		if (host === "localhost" || host === "127.0.0.1") return false;
	} catch {
		return false;
	}
	return { rejectUnauthorized: false };
}

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

// The application handle: a warm node-postgres pool (small because Neon caps
// connections per endpoint) wrapped by Drizzle. Timeouts keep a paused Neon
// database (scale-to-zero) or a dead network from hanging a request forever —
// the pool gives up on a slow connect/query instead of blocking the worker.
// This stays synchronous to build — no I/O happens until a query runs.
export function createDb(env: DatabaseConfig) {
	const pool = new pg.Pool({
		connectionString: env.DATABASE_URL,
		max: 5,
		ssl: sslFor(env.DATABASE_URL),
		connectionTimeoutMillis: 5_000,
		idleTimeoutMillis: 30_000,
		query_timeout: 15_000,
	});
	return drizzle(pool, { schema });
}

// Apply pending migrations on a dedicated, unpooled connection. node-postgres
// runs the whole migration file inside a transaction, so a crash mid-migrate
// leaves no half-applied schema and no stale journal entry. Awaited at server
// boot before anything listens.
export async function migrateDb(env: DatabaseConfig): Promise<void> {
	const url = env.DATABASE_URL_DIRECT || env.DATABASE_URL;
	const pool = new pg.Pool({
		connectionString: url,
		max: 1,
		ssl: sslFor(url),
		connectionTimeoutMillis: 5_000,
	});
	try {
		const db = drizzle(pool, { schema });
		const migrationsDir = findMigrationsDir();
		if (readdirSync(migrationsDir).some((file) => file.endsWith(".sql"))) {
			await migrate(db, { migrationsFolder: migrationsDir });
		}
	} finally {
		await pool.end();
	}
}

export type Database = ReturnType<typeof createDb>;