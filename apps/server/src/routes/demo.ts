import { randomUUID } from "node:crypto";
import { chapter, conceptNode, textbook, user } from "@kiftet/db/schema";
import { and, eq, like } from "drizzle-orm";
import { type Request, Router } from "express";
import { env } from "../env.server";
import { createDemoGate } from "../lib/demo-gate";
import { getDb } from "../services";

// Demo visitors are anonymous. /demo/start fabricates a throwaway user +
// chapter owned by that user; the identity is *DB-backed*, so an
// X-Demo-User-Id header is trusted only when it resolves to a real user row
// with a demo email address. Because the check is a row lookup (not an
// in-memory set), a demo visitor survives server restarts and multi-instance
// deploys. Real (better-auth) user ids are never demo ids — sign-up rejects
// nothing, so a forged header must first own a `@demo.kiftet` user row, which
// only /demo/start creates.
const DEMO_EMAIL_SUFFIX = "@demo.kiftet";

export async function demoUserFor(req: Request): Promise<string | null> {
  const id = req.get("x-demo-user-id");
  if (!id) return null;
  try {
    const rows = await getDb()
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.id, id), like(user.email, `%${DEMO_EMAIL_SUFFIX}`)))
      .limit(1);
    return rows[0]?.id ?? null;
  } catch (error) {
    console.error("[demo] identity lookup failed", error);
    return null;
  }
}

export const DEMO_SEED_TITLE = "Biology — Cell Biology";

const DEMO_TEXTBOOK = {
  title: DEMO_SEED_TITLE,
  subject: "Biology",
  language: "en",
};

const DEMO_CHAPTER = {
  title: "Cell Structure and Function",
  rawText: `Every living organism is built from cells, and each cell carries out the
life processes that keep an organism alive. The plasma membrane surrounds the
cell and controls which substances enter and leave, letting some molecules pass
while blocking others. Inside, the cytoplasm is a watery fluid that holds the
organelles. The nucleus sits at the centre and stores the genetic material,
DNA, directing the cell's activities. Around the nucleus, ribosomes build
proteins from amino acids, mitochondria release energy from food by cellular
respiration to make ATP, and the Golgi apparatus packages proteins and
modifies them for transport to where they are needed. Lysosomes contain enzymes
that digest waste and worn-out cell parts. In plant cells, chloroplasts carry
out photosynthesis to make glucose from sunlight, and a rigid cell wall gives
the cell support and protection. Each organelle has a specific job, and the
cell works because they all cooperate.`,
};

const DEMO_CONCEPTS = [
  "The cell is the basic structural and functional unit of all living organisms",
  "The plasma membrane is a selectively permeable barrier that controls what enters and leaves the cell",
  "Cytoplasm is the fluid inside the cell that holds the organelles",
  "The nucleus stores genetic material (DNA) and controls the cell's activities",
  "Ribosomes are the site of protein synthesis",
  "Mitochondria release energy by cellular respiration, producing ATP",
  "The Golgi apparatus packages and modifies proteins for transport",
  "Lysosomes contain enzymes that digest waste and worn-out cell parts",
  "Chloroplasts are the organelles where photosynthesis occurs in plant cells",
  "The cell wall provides structural support and protection in plant cells",
];

// /demo/start is the one endpoint an anonymous stranger may call, and it is the
// only write path on the main pool that no paying student is waiting behind.
// Two independent limits, because they defend against different attacks:
//
// 1. **Per IP**, to stop one script minting rooms.
//
// 2. **Global**, which is the one that actually matters here, and the reason to
//    be explicit about it: a per-IP limit does *nothing* against a link shared
//    into a Telegram channel. That is a thousand distinct addresses arriving at
//    once, and each one takes its full personal allowance — so "5 per IP per
//    minute" becomes five thousand seeds a minute, each four statements deep,
//    all queued against the same five connections the study loop needs. Lowering
//    the per-IP number would not have fixed that; it would only have made it
//    arrive sooner. Only a process-wide budget bounds the thing we are actually
//    afraid of.
//
// The global budget sheds rather than queues. Queueing is the failure that
// hurts: a demo request waiting on the pool is a real student's session write
// waiting behind it. Refusing instantly costs one visitor a retry; queueing
// costs everyone their latency.
//
// Sized so a demo cannot crowd out study, and bounded so a launch week does not
// quietly write half a million junk rows. See DEMO_STARTS_PER_MINUTE in
// .env.schema to retune without a redeploy.
const START_WINDOW_MS = 60_000;
const START_MAX_PER_IP = 2;

const GLOBAL_STARTS_PER_MINUTE = Math.max(
  1,
  Math.floor(
    typeof env.DEMO_STARTS_PER_MINUTE === "number" &&
      Number.isFinite(env.DEMO_STARTS_PER_MINUTE)
      ? env.DEMO_STARTS_PER_MINUTE
      : 25,
  ),
);

const gate = createDemoGate({
  perIpPerMinute: START_MAX_PER_IP,
  globalPerMinute: GLOBAL_STARTS_PER_MINUTE,
  windowMs: START_WINDOW_MS,
});

const router = Router();

router.post("/start", async (req, res) => {
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const decision = gate.decide(ip);

  if (decision === "per-ip") {
    res.setHeader("Retry-After", String(gate.retryAfterSeconds(ip)));
    res.status(429).json({
      error:
        "Too many demo rooms from this connection. Wait a minute and try again.",
    });
    return;
  }

  if (decision === "global") {
    // 503, not 429, and the copy says what it actually is. A visitor who hits
    // this is not being rate-limited for anything they did — Kiftet is busy
    // because a lot of people arrived at once. Telling them "too many requests
    // from your connection" would be a lie about a limit they never hit, and
    // would send them away instead of telling them to try again in a moment.
    res.setHeader("Retry-After", String(gate.globalRetryAfterSeconds()));
    res.status(503).json({
      error:
        "Kiftet is busy right now — a lot of people are trying the demo at once. Try again in a moment.",
    });
    return;
  }

  const db = getDb();
  const userId = randomUUID();
  const textbookId = randomUUID();
  const chapterId = randomUUID();

  try {
    await db.insert(user).values({
      id: userId,
      name: "Demo Explorer",
      email: `${userId}@demo.kiftet`,
      emailVerified: true,
    });
    await db.insert(textbook).values({
      id: textbookId,
      ownerId: userId,
      ...DEMO_TEXTBOOK,
    });
    await db.insert(chapter).values({
      id: chapterId,
      textbookId,
      ...DEMO_CHAPTER,
    });
    await db.insert(conceptNode).values(
      DEMO_CONCEPTS.map((conceptText, sortOrder) => ({
        id: randomUUID(),
        chapterId,
        conceptText,
        isMisconception: false,
        weight: 1,
        sortOrder,
      })),
    );
  } catch (error) {
    console.error("[demo] setup failed", error);
    res.status(500).json({ error: "Unable to prepare the demo. Try again." });
    return;
  }

  res.status(201).json({ userId, chapterId });
});

export default router;
