/**
 * Register (or inspect) the Telegram webhook, and preflight the channel access
 * that reward eligibility depends on.
 *
 * Why this exists instead of a curl line in a runbook: the webhook and the
 * channel admin right are two separate things, and only the first produces a
 * visible failure. Register the webhook without admin rights and everything
 * *looks* fine — `/start` works, the student is welcomed, the status says they
 * joined — while `getChatMember` fails behind the scenes and every person is
 * permanently ineligible for the reward they were promised. The webhook health
 * check is green; the business is broken. So this checks both, in one command,
 * before anyone shares a link.
 *
 * Usage:
 *   bun run --cwd apps/server telegram:webhook
 *   bun run --cwd apps/server telegram:webhook:check     # read-only
 *   bun run --cwd apps/server telegram:webhook -- --url=https://kiftet.ethiodeploy.com
 *
 * Reads apps/server/.env (Bun loads it automatically). Never prints the token.
 *
 * `--url` overrides the origin the webhook points at. It exists because
 * `BETTER_AUTH_URL` in a developer's `.env` is legitimately
 * `http://localhost:3000`, and registering Telegram against that silently
 * succeeds: Telegram reports `ok: true`, then spends 24 hours delivering every
 * update into a local machine that is usually switched off. The dev value must
 * stay a dev value, so production names its origin explicitly.
 */

import { channelHandleFromUrl } from "../src/lib/telegram-membership";

const TELEGRAM_API = "https://api.telegram.org";
const TIMEOUT_MS = 10_000;

const args = Bun.argv.slice(2);
const argv = new Set(args);
const CHECK_ONLY = argv.has("--check") || argv.has("check");

/** `--url=https://…` or `--url https://…`. Null when not passed. */
function flagUrl(): string | null {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--url") return args[i + 1] ?? null;
    if (arg?.startsWith("--url=")) return arg.slice("--url=".length);
  }
  return null;
}
const URL_OVERRIDE = flagUrl();

let failures = 0;
const ok = (msg: string) => console.log(`  ok   ${msg}`);
const warn = (msg: string) => console.warn(`  WARN ${msg}`);
const bad = (msg: string) => {
  failures += 1;
  console.error(`  FAIL ${msg}`);
};

async function loadEnv(key: string): Promise<string | null> {
  const proc = process.env[key];
  if (proc && proc.trim() !== "") return proc.trim();
  // Bun auto-loads .env for `bun run`, but not when the cwd is elsewhere, so
  // fall back to parsing the files ourselves. This script sits in
  // apps/server/scripts/, so apps/server/.env is one level up; the repo-root
  // .env is checked second, since some setups keep everything there.
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
    } catch (error) {
      // Never silent. This swallowed a missing `await` on `Bun.file().text()`
      // for long enough to report four env vars that were all set as "missing",
      // which is exactly the kind of failure this script exists to prevent
      // people having to debug at launch time.
      if (argv.has("--verbose")) {
        console.error(`  (could not read ${path}: ${String(error)})`);
      }
    }
  }
  return null;
}

async function api(
  token: string,
  method: string,
  params: Record<string, string>,
): Promise<{ ok: boolean; result?: unknown; description?: string }> {
  const url = new URL(`${TELEGRAM_API}/bot${token}/${method}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  return (await res.json()) as {
    ok: boolean;
    result?: unknown;
    description?: string;
  };
}

const token = await loadEnv("TELEGRAM_BOT_TOKEN");
const secret = await loadEnv("TELEGRAM_WEBHOOK_SECRET");
const channelUrl = await loadEnv("TELEGRAM_CHANNEL_URL");
const authUrl = URL_OVERRIDE ?? (await loadEnv("BETTER_AUTH_URL"));

if (!token || !secret || !channelUrl || !authUrl) {
  bad("missing required environment values:");
  if (!token) bad("  TELEGRAM_BOT_TOKEN");
  if (!secret) bad("  TELEGRAM_WEBHOOK_SECRET");
  if (!channelUrl) bad("  TELEGRAM_CHANNEL_URL");
  if (!authUrl)
    bad("  --url=https://<origin>  or  BETTER_AUTH_URL (the public origin)");
  process.exit(1);
}

const origin = authUrl.replace(/\/+$/, "");
const hookUrl = `${origin}/api/telegram/hook`;
const handle = channelHandleFromUrl(channelUrl);

console.log(
  `\nKiftet Telegram preflight — webhook ${CHECK_ONLY ? "CHECK ONLY" : "REGISTER"}\n`,
);
console.log(`  target   ${hookUrl}`);
console.log(`  channel  ${channelUrl}`);
console.log(
  `  token    ${token.slice(0, 5)}…${token.slice(-4)} (${token.length} chars)\n`,
);

// Registering against a local origin is the one failure here that reports
// success. Telegram accepts it, returns ok, then retries updates against a
// machine that is usually off — so the funnel looks configured while nobody
// ever receives a reply. A loud warning rather than a hard block: tunnels exist.
if (/^https?:\/\/(localhost|127\.|\[::1\])/.test(origin)) {
  warn(
    `  ⚠  ${origin} is a LOCAL address. Telegram will accept this webhook, then`,
  );
  warn("     send every update to this machine while it is offline.");
  warn("     Use --url=https://kiftet.ethiodeploy.com for production.");
  warn("");
}

// ── 1. The token itself ──────────────────────────────────────────────────────
const me = await api(token, "getMe", {});
if (!me.ok) {
  bad(`token rejected by Telegram: ${me.description ?? "unknown error"}`);
  process.exit(1);
}
const username = (me.result as { username?: string })?.username ?? "?";
ok(`token valid — bot is @${username}`);

// ── 2. The channel is real and visible to the bot ────────────────────────────
// Checked before membership so a wrong channel URL fails with a clear message
// here, instead of every student quietly reading "not a member" later.
if (handle === null) {
  bad(
    `TELEGRAM_CHANNEL_URL is not a usable public channel link: ${channelUrl}`,
  );
  bad(
    "  It must be https://t.me/<Name>. A private invite link (t.me/+…) has no",
  );
  bad(
    "  username to check membership against, so eligibility could never be confirmed.",
  );
  process.exit(1);
}
const chat = await api(token, "getChat", { chat_id: handle });
if (!chat.ok) {
  bad(
    `bot cannot read channel ${handle}: ${chat.description ?? "unknown error"}`,
  );
  bad(
    "  Either the username is wrong, or the bot is not a member of the channel yet.",
  );
  process.exit(1);
}
const chatTitle =
  (chat.result as { title?: string; type?: string })?.title ?? "?";
ok(`channel ${handle} reachable — "${chatTitle}"`);

// ── 3. The bot can see who joins ─────────────────────────────────────────────
// Membership is read from Telegram's join events, which are only delivered to
// an admin of the chat. So this check — "is the bot an admin" — is the one that
// decides whether anyone can ever become eligible for the reward.
//
// `getChatAdministrators` is used rather than `getChatMember`, which was the
// obvious choice and is wrong here: it returns `Bad Request: invalid user_id
// specified` for EVERY member of this supergroup, including its own creator,
// while `getChatMemberCount` works. Verified against a known member. Whatever
// the cause, checking with it would report a perfectly correct bot as broken.
const admins = await api(token, "getChatAdministrators", { chat_id: handle });
if (!admins.ok) {
  bad(
    `cannot list administrators of ${handle}: ${admins.description ?? "unknown error"}`,
  );
  bad(
    "  Without that, join events are not delivered and no one can be verified.",
  );
  process.exit(1);
}
const list = (admins.result ?? []) as Array<{
  user?: { username?: string; id?: number };
  status?: string;
}>;
const self = list.find(
  (a) => a.user?.username?.toLowerCase() === username.toLowerCase(),
);
if (self?.status === "administrator" || self?.status === "creator") {
  ok(`bot is ${self.status} of the channel — it receives join events`);
} else if (self) {
  bad(`bot is "${self.status}" in the chat, not an administrator.`);
  bad(`  Promote @${username} — join events are delivered only to admins,`);
  bad("  so eligibility could never be confirmed.");
  process.exit(1);
} else {
  bad(`@${username} is not in the administrator list of ${handle}.`);
  bad("  Add it as an admin. Join events go to admins only, so without this");
  bad("  the bot will welcome everyone while nobody ever becomes eligible.");
  process.exit(1);
}
ok(
  `this chat is ${handle} (${chatTitle}) — public join events are being collected`,
);

// ── 4. Register, unless we were only asked to look ───────────────────────────
if (!CHECK_ONLY) {
  const set = await api(token, "setWebhook", {
    url: hookUrl,
    secret_token: secret,
    // `chat_member` is the whole point of this script existing. Without it
    // Telegram never tells us who joined, and membership can only be inferred
    // from `getChatMember` — which does not answer for this group. Subscribe
    // only to what is read, because everything else is load on an endpoint
    // Telegram expects to answer in ten seconds.
    allowed_updates: JSON.stringify(["message", "chat_member"]),
  });
  if (!set.ok) {
    bad(`setWebhook failed: ${set.description ?? "unknown error"}`);
    process.exit(1);
  }
  ok("webhook registered");
}

const info = await api(token, "getWebhookInfo", {});
const w = info.result as
  | {
      url?: string;
      has_custom_certificate?: boolean;
      pending_update_count?: number;
      last_error_message?: string;
      last_error_date?: number;
    }
  | undefined;

console.log("");
if (!info.ok || !w) {
  bad(`getWebhookInfo failed: ${info.description ?? "unknown error"}`);
  process.exit(1);
}
if (w.url === hookUrl) {
  ok(`webhook points at ${w.url}`);
} else {
  bad(`webhook points somewhere else: ${w.url || "(unset)"}`);
  bad(`  expected: ${hookUrl}`);
  bad("  → run `bun run --cwd apps/server telegram:webhook` to register it");
  process.exit(1);
}
if (w.has_custom_certificate === true) {
  warn(
    "Telegram is using a custom TLS certificate — fine, but confirm it is current.",
  );
}
if (typeof w.pending_update_count === "number" && w.pending_update_count > 0) {
  ok(`${w.pending_update_count} update(s) queued — the bot will catch up`);
}
if (w.last_error_message) {
  bad(`last delivery error: ${w.last_error_message}`);
  if (w.last_error_date) {
    bad(`  at ${new Date(w.last_error_date * 1000).toISOString()}`);
  }
} else {
  ok("no delivery errors reported");
}

console.log("");
if (failures > 0) {
  console.error(
    `  ${failures} problem(s) above must be fixed before sharing the link.\n`,
  );
  process.exit(1);
}
console.log(
  "  All checks passed. Walk the flow by hand on a real phone — see RUNBOOK.md.\n",
);
