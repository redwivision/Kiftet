/**
 * Mark existing password accounts verified before the verification gate is
 * turned on.
 *
 * Accounts created before real mail delivery existed have `email_verified =
 * false` because nobody could confirm them. Flipping REQUIRE_EMAIL_VERIFICATION
 * before they are handled would lock every one of them out. This command finds
 * exactly those rows — password accounts only, never social-only accounts — and
 * leaves them alone unless `--apply` is passed.
 *
 * Usage:
 *   bun run --cwd apps/server auth:backfill-verified                  # dry run
 *   bun run --cwd apps/server auth:backfill-verified -- --apply       # write
 *   bun run --cwd apps/server auth:backfill-verified -- --apply \
 *     --before=2026-10-29T00:00:00Z
 *
 * `--before` limits the backfill to accounts created before that moment, so
 * accounts that signed up after Brevo started sending can still prove their
 * address normally.
 *
 * Reads apps/server/.env (Bun loads it automatically) and prints only the
 * database hostname, never the connection string.
 */

import { createDb } from "@kiftet/db";
import { sql } from "drizzle-orm";

import { env } from "../src/env.server";

const args = Bun.argv.slice(2);
const APPLY = args.includes("--apply");

/** `--before=value` or `--before value`. Null when not passed. */
function flagValue(prefix: string): string | null {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === prefix) return args[i + 1] ?? null;
    if (arg?.startsWith(`${prefix}=`)) return arg.slice(prefix.length + 1);
  }
  return null;
}

const beforeRaw = flagValue("--before");
let before: Date | null = null;
if (beforeRaw) {
  before = new Date(beforeRaw);
  if (Number.isNaN(before.getTime())) {
    console.error(`\n  FAIL --before is not a valid date: ${beforeRaw}\n`);
    process.exit(1);
  }
}

const db = createDb(env);
const host = new URL(env.DATABASE_URL).hostname;
const predicate = before
  ? sql`u.email_verified = false
      and u.created_at < ${before}
      and exists (
        select 1 from account a
        where a.user_id = u.id and a.provider_id = 'credential'
      )`
  : sql`u.email_verified = false
      and exists (
        select 1 from account a
        where a.user_id = u.id and a.provider_id = 'credential'
      )`;

console.log("\nKiftet verified-email backfill\n");
console.log(`  database   ${host}`);
console.log(
  `  scope      unverified password accounts${before ? ` created before ${before.toISOString()}` : ""}`,
);
console.log(`  mode       ${APPLY ? "APPLY" : "dry run"}\n`);

const counted = await db.execute(sql`
  select count(*)::int as n
  from "user" u
  where ${predicate}
`);
const count = (counted.rows[0] as { n: number }).n;

console.log(`  ${count} account(s) match.`);

if (!APPLY) {
  console.log(
    "\n  Dry run — nothing written. Re-run with --apply when delivery is proven.\n",
  );
  await db.$client.end();
  process.exit(0);
}

if (!before) {
  console.log(
    "\n  ⚠  No --before cutoff: every currently unverified password account is being marked verified.\n",
  );
}

const updated = await db.execute(sql`
  with changed as (
    update "user" u
    set email_verified = true, updated_at = now()
    where ${predicate}
    returning 1
  )
  select count(*)::int as n from changed
`);
const changed = (updated.rows[0] as { n: number }).n;

await db.$client.end();

console.log(`  Updated ${changed} account(s).\n`);
