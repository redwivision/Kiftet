import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

import type { DatabaseConfig } from "./config";
import * as schema from "./schema";

function hostOf(url: string): string | null {
	try {
		return new URL(url).hostname;
	} catch {
		return null;
	}
}

// Fails loudly instead of letting node-postgres fall back to its defaults
// (host 127.0.0.1, port 5432, DB = OS username). When DATABASE_URL is
// missing in a production container the app would otherwise just crash with
// a raw "connect ECONNREFUSED 127.0.0.1:5432" that looks like a network
// problem — this names the real cause (the variable never reached the
// process) and prints it to stderr, the stream container boot logs show.
export function requireDbUrl(
	url: string | undefined,
	name: string,
	runtime: string,
): string {
	if (!url || url.trim().length === 0) {
		throw new Error(
			`[kiftet:db] ${name} is NOT set in this process. In ${runtime} it must come from a runtime environment variable — .env files are not loaded. Set ${name} (e.g. a Neon pooled URL) on the platform's server service and redeploy.`,
		);
	}
	const host = hostOf(url);
	if (!host) {
		throw new Error(
			`[kiftet:db] ${name} is not a valid URL: got ${JSON.stringify(url)}.`,
		);
	}
	if (
		runtime === "production" &&
		["localhost", "127.0.0.1", "::1"].includes(host)
	) {
		throw new Error(
			`[kiftet:db] ${name} resolves to the localhost placeholder (${host}) in production — that's the .env.schema fallback, not a real database. Set the real ${name} on the platform.`,
		);
	}
	return url;
}

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
		(dir) =>
			existsSync(dir) && readdirSync(dir).some((file) => file.endsWith(".sql")),
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
		connectionString: requireDbUrl(
			env.DATABASE_URL,
			"DATABASE_URL",
			env.NODE_ENV ?? "development",
		),
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
	const url = requireDbUrl(
		env.DATABASE_URL_DIRECT || env.DATABASE_URL,
		"DATABASE_URL_DIRECT || DATABASE_URL",
		env.NODE_ENV ?? "development",
	);
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
