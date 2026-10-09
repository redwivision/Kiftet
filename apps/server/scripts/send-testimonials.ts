/**
 * Backfill: send any testimonials the live forward missed, to the operator.
 *
 * New testimonials now reach the operator on their own — the webhook forwards
 * each one the moment a student sends it (see routes/telegram.ts). This script
 * covers the gaps: rows that arrived before `TELEGRAM_ADMIN_CHAT_ID` was set, or
 * whose forward failed, sit unmarked in `waitlist_signup.testimonial_text` for
 * it to pick up. It is also the way to re-read the whole set.
 *
 * Usage:
 *   bun run --cwd apps/server telegram:testimonials
 *   bun run --cwd apps/server telegram:testimonials -- --to=<chat id>
 *   bun run --cwd apps/server telegram:testimonials -- --dry-run
 *   bun run --cwd apps/server telegram:testimonials -- --all
 *
 * Sends only what has not been sent before — `testimonial_sent_at` is stamped
 * once a message is delivered — so it is safe to run on a schedule or on a whim
 * without re-pinging the same opinions. `--all` re-sends everything, and
 * `--dry-run` prints without sending or marking anything.
 *
 * Reads apps/server/.env (Bun loads it automatically). Never prints the token.
 */

import { createDb } from "@kiftet/db";
import { waitlistSignup } from "@kiftet/db/schema";
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";

import { formatTestimonial } from "../src/lib/testimonial";

const TELEGRAM_API = "https://api.telegram.org";
const TIMEOUT_MS = 15_000;
// Telegram allows about 30 messages a second; a third of a second between sends
// is orders of magnitude under that and keeps a long backfill from being the one
// time the limit is actually felt.
const SEND_GAP_MS = 350;

const args = Bun.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const ALL = args.includes("--all");

/** `--to=<value>` or `--to <value>`. Null when not passed. */
function flagValue(prefix: string): string | null {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === prefix) return args[i + 1] ?? null;
    if (arg?.startsWith(`${prefix}=`)) return arg.slice(prefix.length + 1);
  }
  return null;
}
const TO = flagValue("--to");

let failures = 0;
const ok = (msg: string) => console.log(`  ok   ${msg}`);
const bad = (msg: string) => {
  failures += 1;
  console.error(`  FAIL ${msg}`);
};

async function loadEnv(key: string): Promise<string | null> {
  const proc = process.env[key];
  if (proc && proc.trim() !== "") return proc.trim();
  // Bun auto-loads .env for `bun run`, but not when the cwd is elsewhere, so
  // fall back to parsing the files ourselves — this script sits in
  // apps/server/scripts/, and the repo-root .env is checked second.
  for (const path of ["../.env", "../../.env"]) {
    try {
      const text = await Bun.file(new URL(path, import.meta.url)).text();
      for (const line of text.split("\n")) {
        const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
        if (!m || m[1] !== key) continue;
        let value = (m[2] ?? "").trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (value !== "") return value;
      }
    } catch {
      // Missing on purpose: the caller reports the variable itself, and every
      // path it looked in, which is the part that is actually actionable.
    }
  }
  return null;
}

async function call(
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; result?: unknown; description?: string }> {
  let res: Response;
  try {
    res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    const detail =
      name === "TimeoutError" || name === "AbortError"
        ? `api.telegram.org did not answer within ${TIMEOUT_MS / 1000}s`
        : `could not reach api.telegram.org — ${String(error)}`;
    bad(`${method}: ${detail}`);
    return { ok: false, description: detail };
  }
  return (await res.json()) as {
    ok: boolean;
    result?: unknown;
    description?: string;
  };
}

/** One testimonial as the operator should read it: who, when, then the words. */
function format(row: typeof waitlistSignup.$inferSelect): string {
  return formatTestimonial(row);
}

const token = await loadEnv("TELEGRAM_BOT_TOKEN");
if (!token) {
  bad("TELEGRAM_BOT_TOKEN is not set.");
  bad("  Add it to apps/server/.env before running this.");
  process.exit(1);
}

const dbUrl =
  (await loadEnv("DATABASE_URL_DIRECT")) ?? (await loadEnv("DATABASE_URL"));
if (!dbUrl) {
  bad("neither DATABASE_URL_DIRECT nor DATABASE_URL is set.");
  bad("  Add one to apps/server/.env before running this.");
  process.exit(1);
}

const chatId = TO ?? (await loadEnv("TELEGRAM_ADMIN_CHAT_ID"));
if (!chatId && !DRY_RUN) {
  bad("no destination set — nowhere to send the testimonials.");
  bad("  This run:      --to=<chat id>");
  bad("  Every run:     TELEGRAM_ADMIN_CHAT_ID=<chat id>  in apps/server/.env");
  bad("  Find your id:  message @userinfobot on Telegram, or read it from the");
  bad(
    "                 waitlist: SELECT telegram_chat_id FROM waitlist_signup",
  );
  bad("                 WHERE phone = '+2519…';");
  process.exit(1);
}

const db = createDb({ DATABASE_URL: dbUrl, NODE_ENV: process.env.NODE_ENV });

// Newest last, so a run reads top-to-bottom as the story so far. `--all`
// ignores the sent marker; the default only picks up what is new.
const rows = await db
  .select()
  .from(waitlistSignup)
  .where(
    ALL
      ? isNotNull(waitlistSignup.testimonialAt)
      : and(
          isNotNull(waitlistSignup.testimonialAt),
          isNull(waitlistSignup.testimonialSentAt),
        ),
  )
  .orderBy(asc(waitlistSignup.testimonialAt));

console.log(
  `\nKiftet testimonials — ${rows.length} to send${DRY_RUN ? " (dry run)" : ""}${ALL ? " (all)" : ""}\n`,
);

if (rows.length === 0) {
  console.log("  Nothing new. Every testimonial has been sent already.\n");
  await db.$client.end();
  process.exit(0);
}

for (const row of rows) {
  if (DRY_RUN) {
    console.log(`${format(row)}\n${"─".repeat(40)}`);
    continue;
  }
  if (!chatId) break;
  const sent = await call(token, "sendMessage", {
    chat_id: chatId,
    text: format(row),
  });
  if (!sent.ok) {
    bad(
      `could not send ${row.name} (${row.id}): ${sent.description ?? "unknown error"}`,
    );
    continue;
  }
  await db
    .update(waitlistSignup)
    .set({ testimonialSentAt: new Date() })
    .where(eq(waitlistSignup.id, row.id));
  ok(`${row.name} (${row.id})`);
  await new Promise((resolve) => setTimeout(resolve, SEND_GAP_MS));
}

await db.$client.end();

console.log("");
if (failures > 0) {
  console.error(
    `  ${failures} testimonial(s) could not be sent — run again to retry them.\n`,
  );
  process.exit(1);
}
console.log("  Done.\n");
