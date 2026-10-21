import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

// The migrations folder lives in this package's source. When the API is
// bundled (tsdown → apps/server/dist) this module is inlined, so
// "next to the module" no longer points at the SQL files — walk back to
// the repo root and resolve the source path instead.
export function findMigrationsDir(): string {
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

/** Same walk, exposed for the test harness. */
export const findTestMigrationsDir = findMigrationsDir;
