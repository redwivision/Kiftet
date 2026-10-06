import { createAuth as createConfiguredAuth } from "@kiftet/auth";
import { createDb, type Database } from "@kiftet/db";

import { env } from "./env.server";

const db = createDb(env);

/**
 * A second, deliberately tiny pool for the waitlist.
 *
 * The main pool is five connections shared by SSR, auth, the study loop and
 * every AI-backed query. The waitlist is the one write that must not queue
 * behind any of them: a signup that times out because a Gemini retry ladder
 * was occupying the pool turns an AI problem into a "your signup didn't work"
 * problem, which is the worst possible way for that failure to present.
 *
 * Two connections is enough — a waitlist insert is a single indexed row write,
 * so concurrency buys nothing here, and every connection held here is one the
 * study loop cannot use. This is also why it is worth *not* reaching for Redis
 * or a queue: the fix is two lines of pool configuration.
 */
const WAITLIST_POOL_MAX = 2;
const waitlistDb = createDb(env, { max: WAITLIST_POOL_MAX });

export function getDb(): Database {
  return db;
}

/** Only the waitlist routes may use this. Anything else belongs on `getDb`. */
export function getWaitlistDb(): Database {
  return waitlistDb;
}

export const auth = createConfiguredAuth(env, db);
