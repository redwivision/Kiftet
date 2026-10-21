import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

import type { DatabaseConfig } from "./config";
import {
  DEFAULT_CONNECT_RETRIES,
  DEFAULT_CONNECT_TIMEOUT_MS,
  DEFAULT_POOL_MAX,
  intFrom,
} from "./pool-config";
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
  // Disabled: allow localhost in any runtime for local testing
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

// ─── Connection budget ───────────────────────────────────────────────
// Pure arithmetic lives in pool-config.ts so it can be tested without a
// database; this module only wires it into node-postgres.
//
// A backend that dies while idle (Neon restart, network drop) surfaces as an
// `error` event on the pool, not on a query. node-postgres documents that an
// unhandled pool `error` throws — which would take the whole process down for a
// problem the pool already knows how to recover from. Log it and let the pool
// replace the dead client.
function attachPoolErrorHandler(pool: pg.Pool, name: string): void {
  pool.on("error", (error) => {
    console.error(
      `[kiftet:db] idle client error on the ${name} pool (recovering): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  });
}

// A Neon compute scales to zero after 5 minutes idle; the next connection pays
// the cold start (a few hundred ms typically, more under load or distance) and
// the pooler may queue the transaction briefly. Neon's own guidance is a raised
// timeout plus bounded retries with backoff — but only the *connection* is
// retried here, never a query: replaying a statement is how you double-charge
// a student. Used where a retry is safe and idempotent (boot migrations).
export async function connectWithRetry(
  pool: pg.Pool,
  attempts = DEFAULT_CONNECT_RETRIES,
  baseDelayMs = 400,
): Promise<pg.PoolClient> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await pool.connect();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        // Exponential backoff with full jitter, so a fleet waking one cold
        // database does not retry in lockstep and stampede it again.
        const ceiling = baseDelayMs * 2 ** attempt;
        const delay = Math.random() * ceiling;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError ?? "could not connect to the database"));
}

// The application handle: a warm node-postgres pool (small because Neon caps
// connections per endpoint) wrapped by Drizzle. Timeouts keep a paused Neon
// database (scale-to-zero) or a dead network from hanging a request forever —
// the pool gives up on a slow connect/query instead of blocking the worker.
// This stays synchronous to build — no I/O happens until a query runs.
export function createDb(env: DatabaseConfig, options: { max?: number } = {}) {
  const url = requireDbUrl(
    env.DATABASE_URL,
    "DATABASE_URL",
    env.NODE_ENV ?? "development",
  );
  const pool = new pg.Pool({
    connectionString: url,
    max: options.max ?? intFrom(env.DB_POOL_MAX, DEFAULT_POOL_MAX),
    ssl: sslFor(url),
    connectionTimeoutMillis: intFrom(
      env.DB_CONNECT_TIMEOUT_MS,
      DEFAULT_CONNECT_TIMEOUT_MS,
    ),
    idleTimeoutMillis: 30_000,
    query_timeout: 15_000,
  });
  attachPoolErrorHandler(pool, "main");
  return drizzle(pool, { schema });
}

// Arbitrary but stable across deploys — every instance must contend for the
// same key. Derived from "kiftet" so it can't collide with another app's lock.
const MIGRATION_LOCK_KEY = 1_295_664_799;

// Apply pending migrations on a dedicated, unpooled connection. node-postgres
// runs the whole migration file inside a transaction, so a crash mid-migrate
// leaves no half-applied schema and no stale journal entry. Awaited at server
// boot before anything listens.
//
// A rolling deploy runs several instances at once, and two boots racing the
// migration journal is the one way this can go wrong in production. A Postgres
// advisory lock serializes them: the loser waits, then finds the schema already
// applied and no-ops. The lock lives on its own connection so the single pooled
// connection stays free for the migration itself.
export async function migrateDb(env: DatabaseConfig): Promise<void> {
  const url = requireDbUrl(
    env.DATABASE_URL_DIRECT || env.DATABASE_URL,
    "DATABASE_URL_DIRECT || DATABASE_URL",
    env.NODE_ENV ?? "development",
  );
  const poolOptions = {
    connectionString: url,
    max: 1,
    ssl: sslFor(url),
    connectionTimeoutMillis: intFrom(
      env.DB_CONNECT_TIMEOUT_MS,
      DEFAULT_CONNECT_TIMEOUT_MS,
    ),
  };
  const pool = new pg.Pool(poolOptions);
  const lockPool = new pg.Pool(poolOptions);
  attachPoolErrorHandler(pool, "migration");
  attachPoolErrorHandler(lockPool, "migration-lock");
  let held: pg.PoolClient | null = null;
  try {
    // A cold boot is the most likely place to meet a suspended Neon compute,
    // and migrating is idempotent under the advisory lock — so this is the one
    // place a bounded connect retry is unambiguously safe.
    held = await connectWithRetry(
      lockPool,
      intFrom(env.DB_CONNECT_RETRIES, DEFAULT_CONNECT_RETRIES),
    );
    await held.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    const db = drizzle(pool, { schema });
    const migrationsDir = findMigrationsDir();
    if (readdirSync(migrationsDir).some((file) => file.endsWith(".sql"))) {
      await migrate(db, { migrationsFolder: migrationsDir });
    }
  } finally {
    if (held) {
      // Released explicitly so the lock frees as soon as we're done rather than
      // lingering until the pool drains. If the process dies outright, Postgres
      // drops the lock with the session, so there is nothing to leak.
      await held
        .query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY])
        .catch(() => {});
      held.release();
    }
    await lockPool.end();
    await pool.end();
  }
}

export type Database = ReturnType<typeof createDb>;
