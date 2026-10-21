/**
 * A real Postgres for tests, in-process.
 *
 * The launch path — ingest a chapter, start a session, answer, submit, read the
 * result — is mostly SQL: foreign keys, `ON CONFLICT`, transactions, the
 * advisory lock around extraction. Pure-helper tests cannot see any of that, so
 * the pieces most likely to break in production (a bad unique index, a cascade
 * that deletes too much) were previously verified only by hand against real
 * Neon. PGlite is Postgres compiled to WASM: the same SQL semantics, no network
 * and no secrets, so these tests run in plain `bun test` everywhere.
 *
 * The migrations applied here are the repository's own `*.sql` files, not a
 * `drizzle-kit push` of the TS schema — a hand-edited schema that never made it
 * into a migration would pass the second and fail in production, and catching
 * exactly that is the point.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import { findTestMigrationsDir } from "./migrations-dir";
import * as schema from "./schema";

export type TestDatabase = ReturnType<typeof drizzle<typeof schema>> & {
  /** Close the underlying WASM instance so a test process can exit cleanly. */
  $close: () => Promise<void>;
};

/**
 * Build a fresh, migrated, empty database. Each call is an independent Postgres
 * instance, so tests never share state and need no truncation between cases.
 */
export async function createTestDb(): Promise<TestDatabase> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: findTestMigrationsDir() });
  return Object.assign(db, {
    $close: () => client.close(),
  }) as TestDatabase;
}
