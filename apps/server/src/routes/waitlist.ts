import { randomUUID } from "node:crypto";
import { waitlistSignup } from "@kiftet/db/schema";
import { desc, eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";

import { env } from "../env.server";
import { maskPhone, normalizeEthiopianPhone } from "../lib/phone";
import { createRollingWindow } from "../lib/rolling-window";
import { getWaitlistDb } from "../services";

/**
 * The launch waitlist.
 *
 * This is the endpoint whose whole job is to not fail. Everything about it is
 * shaped by that:
 *
 *  - **No AI, no email, no third party on the request path.** A signup is one
 *    indexed row write. It cannot be starved by the Gemini quota, cannot be
 *    delayed by a mail provider, and cannot fail because something we do not
 *    control is down. Every dependency it *does* have is one we can reason
 *    about.
 *  - **Its own two-connection pool** (see services.ts), so a Gemini retry storm
 *    occupying the main pool cannot present as a broken signup form.
 *  - **Idempotent on the phone number.** A double-tap on school wi-fi returns
 *    the same wave rather than a duplicate or an error — an error here reads as
 *    "the site is broken" and loses the signup permanently.
 *  - **A full waitlist is HTTP 200.** If the cap is hit, the response is a
 *    closed state, not a failure. A 500 on the hero CTA of the landing page is
 *    the worst thing this endpoint could ever do.
 */

/**
 * Bump when the promise changes, and the new signups freeze a new snapshot.
 * Signups already on the list keep the snapshot they accepted — that is the
 * entire point of storing it. The rule: never edit a released promise in place,
 * bump the version and ship new copy, or the founding-price lock becomes a
 * number nobody wrote down.
 */
export const PROMISE_VERSION = "2026-10-05.v1";

/** Months of premium a fully-qualified signup earns at launch. */
const REWARD_PREMIUM_MONTHS = 1;

/**
 * Frozen at signup so "what were we told" is answerable on launch day without
 * archaeology. `foundingPriceEtb` is deliberately null until a price exists:
 * inventing a number here would be inventing a business decision, and a
 * fabricated price lock is worse than none because it looks enforceable.
 */
const REWARD = {
  premiumMonths: REWARD_PREMIUM_MONTHS,
  requires: ["channel", "testimonial"] as const,
  foundingPriceEtb: null as number | null,
};

const WAVE_SIZE = Math.max(
  1,
  Math.floor(
    typeof env.WAITLIST_WAVE_SIZE === "number" &&
      Number.isFinite(env.WAITLIST_WAVE_SIZE)
      ? env.WAITLIST_WAVE_SIZE
      : 250,
  ),
);

const MAX_SIGNUPS = Math.max(
  1,
  Math.floor(
    typeof env.WAITLIST_MAX_SIGNUPS === "number" &&
      Number.isFinite(env.WAITLIST_MAX_SIGNUPS)
      ? env.WAITLIST_MAX_SIGNUPS
      : 20_000,
  ),
);

const PER_IP_PER_HOUR = Math.max(
  1,
  Math.floor(
    typeof env.WAITLIST_PER_IP_PER_HOUR === "number" &&
      Number.isFinite(env.WAITLIST_PER_IP_PER_HOUR)
      ? env.WAITLIST_PER_IP_PER_HOUR
      : 60,
  ),
);

/**
 * Generous on purpose. A school behind one NAT, or a carrier CGNAT, hands the
 * same public IP to every student in it — a limit tuned to stop a script also
 * locks out a class that is signing up correctly, and that is the failure that
 * costs real signups. Abuse is bounded by something better than IP anyway: the
 * unique constraint on `phone` means a script can mint at most one row per
 * number it actually possesses.
 */
const ipLimiter = createRollingWindow(60 * 60_000, 5_000);

/** Wave number is *derived* from `seq`, never stored, so it cannot drift out of
 *  sync with the sequence it is supposed to describe. */
function waveFor(seq: number): number {
  return Math.floor((seq - 1) / WAVE_SIZE) + 1;
}

const signupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Please enter your name.")
    .max(80, "That name is too long."),
  phone: z
    .string()
    .trim()
    .min(6, "Please enter your phone number.")
    .max(32, "That phone number is too long."),
  language: z.enum(["en", "am"]).default("en"),
  // Recorded, not assumed: PDPL 1321/2024 requires the lawful basis to be
  // demonstrable, and "they filled in the form" is not a basis.
  consent: z.boolean().refine((value) => value === true, {
    message: "Please agree to the privacy notice to join.",
  }),
  // Honeypot. Named like a field a human would never see but a naive bot fills
  // in. Checked rather than trusted, and never mentioned in the error copy.
  website: z.string().max(0).optional(),
});

function clientIp(req: { ip?: string; socket: { remoteAddress?: string } }) {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

function telegramDeepLink(token: string): string | null {
  const username = env.TELEGRAM_BOT_USERNAME;
  if (!username) return null;
  return `https://t.me/${username.replace(/^@/, "")}?start=${token}`;
}

/**
 * One string per thing a student can be asked to do. Declared once so the
 * server's `nextStep` union and the client's branches are the same list rather
 * than two lists that start out agreeing.
 *
 * Null is not a step: it is the closed-waitlist state, where there is nothing
 * to do because there is nothing left to give.
 */
const NEXT_STEPS = [
  "join-channel",
  "verify-channel",
  "write-testimonial",
  "ready",
] as const;

type NextStep = (typeof NEXT_STEPS)[number] | null;

type PublicStatus = {
  id: string;
  seq: number;
  wave: number;
  waveSize: number;
  joinedAt: string;
  joinedChannel: boolean;
  testimonialSubmitted: boolean;
  eligibleForPremium: boolean;
  /**
   * Exactly one thing left to do, or null when the list is closed.
   *
   * `verify-channel` is distinct from `join-channel` because we learn about the
   * join from Telegram, not from this request. "You joined" and "we have
   * confirmed you joined" are two different moments, and collapsing them made
   * the first step tick itself off for people who had done nothing. A student
   * who joined before pressing Start has no join event left to give us, so
   * `/joined` in the channel is the only action left — and it needs its own
   * button.
   *
   * Derived from stored facts in `statusFor` rather than written twice, so the
   * buttons can never disagree with the eligibility rule behind them.
   */
  nextStep: NextStep;
  premiumMonths: number;
  telegramUrl: string | null;
  channelUrl: string | null;
};

/**
 * The one shape both endpoints return, built from a row.
 *
 * `nextStep` is the whole product in a field: a student can always see exactly
 * one thing left to do. It is derived from two stored facts rather than a
 * stored flag, so it cannot drift out of agreement with the data — and it means
 * nobody has to run a query to answer "is this person qualified yet?".
 *
 * `joinedChannel` reads `channelVerifiedAt`, NOT `activatedAt`. Those are
 * different claims: one is "they pressed Start in the bot", the other is
 * "Telegram confirmed they are in the channel". Reporting the first as the
 * second told students their first step was done when it was not, and marked
 * them eligible for a month of premium they had not earned.
 */
function statusFor(row: typeof waitlistSignup.$inferSelect): PublicStatus {
  const joinedChannel = row.channelVerifiedAt !== null;
  const testimonialSubmitted = row.testimonialAt !== null;
  const eligibleForPremium = joinedChannel && testimonialSubmitted;
  return {
    id: row.id,
    seq: row.seq,
    wave: waveFor(row.seq),
    waveSize: WAVE_SIZE,
    joinedAt: row.createdAt.toISOString(),
    joinedChannel,
    testimonialSubmitted,
    eligibleForPremium,
    nextStep: eligibleForPremium
      ? "ready"
      : testimonialSubmitted
        ? // They have the testimonial but we have not confirmed the join. The
          // only remaining action is the `/joined` command in the channel, so
          // that is what the buttons must offer — sending them back to the
          // bot's testimonial thread would be sending them nowhere.
          "verify-channel"
        : joinedChannel
          ? "write-testimonial"
          : "join-channel",
    premiumMonths: REWARD.premiumMonths,
    telegramUrl: telegramDeepLink(row.activationToken),
    channelUrl: env.TELEGRAM_CHANNEL_URL || null,
  };
}

const router = Router();

/** Cheap check for the cap: an index backwards scan for the newest row rather
 *  than a COUNT, which on a table that only ever grows is the wrong query. */
async function atCapacity(): Promise<boolean> {
  const [newest] = await getWaitlistDb()
    .select({ seq: waitlistSignup.seq })
    .from(waitlistSignup)
    .orderBy(desc(waitlistSignup.seq))
    .limit(1);
  return (newest?.seq ?? 0) >= MAX_SIGNUPS;
}

router.get("/promise", (_req, res) => {
  // The live offer, published before anyone signs up.
  //
  // This exists because the reward is a promise, and the sign-up form has to
  // state it in words before it has an id to look anything up with. Duplicating
  // the number in the client is how the two drift: change the reward here and a
  // hardcoded "1 month" keeps being advertised to students while the API says
  // something else. One source of truth, read by the thing that makes the
  // promise.
  //
  // Deliberately public and deliberately dull — no ids, no counts, nothing that
  // reveals how many people have signed up.
  res.status(200).json({
    version: PROMISE_VERSION,
    premiumMonths: REWARD.premiumMonths,
    requires: REWARD.requires,
    waveSize: WAVE_SIZE,
    telegramUrl: env.TELEGRAM_BOT_USERNAME
      ? `https://t.me/${env.TELEGRAM_BOT_USERNAME.replace(/^@/, "")}`
      : null,
    channelUrl: env.TELEGRAM_CHANNEL_URL || null,
  });
});

router.post("/", async (req, res) => {
  const ip = clientIp(req);

  if (!ipLimiter.hit(ip, PER_IP_PER_HOUR)) {
    res.setHeader("Retry-After", String(ipLimiter.resetInSeconds(ip)));
    res.status(429).json({
      error:
        "Too many signups from this connection. Try again in a little while — if you already joined, you can look yourself up below.",
    });
    return;
  }

  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: parsed.error.issues[0]?.message ?? "Invalid" });
    return;
  }
  // `consent` is not destructured: the schema's refine already guarantees it is
  // `true` by the time we get here, and the record is written from `now` below.
  // Keeping the variable would only invite a second, weaker check.
  const { name, phone: rawPhone, language, website } = parsed.data;

  if (website) {
    // Answer exactly as a success would. Telling a bot its honeypot was
    // detected just tells it to retry without the field.
    res.status(200).json({ ok: true });
    return;
  }

  const normalized = normalizeEthiopianPhone(rawPhone, {
    onRejected: (prefix) => {
      // The signal that a newly allocated mobile area code exists and this
      // allowlist is out of date. Logged so it shows up in a launch-day review
      // instead of as an unexplained drop in signups.
      console.warn(
        `[waitlist] refused a nine-digit number with prefix "${prefix}" — if the NBE allocated it for mobile, add it to MOBILE_AREA_CODES in lib/phone.ts`,
      );
    },
  });

  if (!normalized.ok) {
    const message =
      normalized.problem === "too-long"
        ? "Enter an Ethiopian phone number, like 0911 234 567."
        : normalized.problem === "not-mobile"
          ? "That looks like a landline. Enter your mobile number, like 0911 234 567."
          : "Enter your phone number, like 0911 234 567.";
    res.status(400).json({ error: message, field: "phone" });
    return;
  }

  if (await atCapacity()) {
    res
      .status(200)
      .json({ closed: true, channelUrl: env.TELEGRAM_CHANNEL_URL || null });
    return;
  }

  const id = randomUUID();
  const activationToken = randomUUID().replace(/-/g, "");
  const now = new Date();

  const inserted = await getWaitlistDb()
    .insert(waitlistSignup)
    .values({
      id,
      activationToken,
      // `seq` is deliberately omitted: `serial` lets Postgres assign it, which
      // is what makes the sequence contention-free. Setting it here would mean
      // computing a value we then have to trust.
      phone: normalized.phone,
      name,
      language,
      foundingPriceEtb: REWARD.foundingPriceEtb,
      promiseVersion: PROMISE_VERSION,
      promiseSnapshot: {
        reward: REWARD,
        capturedAt: now.toISOString(),
      },
      consentAt: now,
      consentVersion: PROMISE_VERSION,
      createdAt: now,
    })
    .onConflictDoNothing({ target: waitlistSignup.phone })
    .returning();

  if (inserted.length === 0) {
    // Already on the list. Not an error — a double-tap on a slow connection is
    // the expected case, and returning their existing wave is the whole point.
    const [existing] = await getWaitlistDb()
      .select()
      .from(waitlistSignup)
      .where(eq(waitlistSignup.phone, normalized.phone))
      .limit(1);
    if (!existing) {
      // Vanished between the insert and this read (deleted as spam in that
      // window). Tell them to try again rather than inventing a confirmation.
      res.status(409).json({
        error: "Something went wrong saving your place. Please try again.",
      });
      return;
    }
    res.status(200).json({ ok: true, existing: true, ...statusFor(existing) });
    return;
  }

  const row = inserted[0];
  if (!row) {
    // `onConflictDoNothing` returning nothing is the duplicate branch above, so
    // reaching here means the row was neither inserted nor already present.
    // Refusing to invent a confirmation is the point: a signup that reports
    // success without a row behind it is unrecoverable for that student.
    console.error("[waitlist] insert returned no row without a conflict");
    res.status(500).json({
      error: "Something went wrong saving your place. Please try again.",
    });
    return;
  }

  console.error(
    `[waitlist] +1 signup seq=${row.seq} wave=${waveFor(row.seq)} ${maskPhone(normalized.phone)} ${language}`,
  );
  res.status(201).json({ ok: true, existing: false, ...statusFor(row) });
});

/**
 * Look up your own signup.
 *
 * Keyed on the unguessable signup id, which the client keeps — the same
 * capability-token shape the demo identity uses. Deliberately *not* keyed on
 * the phone number: an open lookup by phone would let anyone holding a number
 * confirm whether that person is on the list and how far along they are, which
 * is exactly the kind of small leak that is cheap to avoid.
 */
router.get("/status", async (req, res) => {
  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    res.status(400).json({ error: "Missing or malformed signup id." });
    return;
  }

  const [row] = await getWaitlistDb()
    .select()
    .from(waitlistSignup)
    .where(eq(waitlistSignup.id, id))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "We couldn't find that signup." });
    return;
  }

  res.status(200).json(statusFor(row));
});

export default router;
