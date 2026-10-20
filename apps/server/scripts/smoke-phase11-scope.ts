/**
 * Live smoke test for Phase 11's scope + baseline work (steps 4–5).
 *
 * Why a script and not more unit tests: the unit tests prove the pure helpers
 * (`scopedUnits`, `summarizeStudyScores`) and the writer's prompt shape, but
 * they cannot prove the *wiring* — that a PATCHed scope actually narrows the
 * generated questions, that a stale picker key falls back to the whole chapter
 * instead of an empty quiz, or that `before` really comes off the baseline.
 * Every one of those is a route reading a column, and a route reading the wrong
 * column is exactly the class of bug a green unit suite hides. So this drives
 * the real HTTP surface against a real server and a real database.
 *
 * It uses the demo room (`POST /demo/start`) because that is the only identity
 * a script can mint without a browser: the demo user owns a chapter with
 * hand-written concepts, so the checks do not depend on extraction quality.
 *
 * Usage (server must already be running):
 *   bun run --cwd apps/server smoke:phase11
 *   bun run --cwd apps/server smoke:phase11 --base=http://localhost:3000
 *   bun run --cwd apps/server smoke:phase11 --pace=16000   # slower AI calls
 *
 * The free tier allows 5 AI requests a minute, so the AI-dependent checks are
 * paced and a 429 is retried once after the server's own `Retry-After`, then
 * reported as SKIP rather than FAIL — a busy minute is not a broken feature.
 * Exits non-zero only on a real assertion failure.
 */

export {};

const flag = (name: string, fallback: string): string =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1] ??
  fallback;

const BASE = flag(
  "base",
  process.env.KIFTET_BASE_URL ?? "http://localhost:3000",
);
const API = `${BASE.replace(/\/+$/, "")}/api`;
const PACE_MS = Number(flag("pace", "13000"));

type Unit = {
  key: string;
  conceptCount: number;
  concepts: string[];
};
type Question = { focus?: string[] };
type GuideSection = { conceptText: string };

type Frame<T> = { status: number; json: T | null; retryAfter?: number };

type Result = "PASS" | "FAIL" | "SKIP";
const results: { name: string; result: Result; note?: string }[] = [];

function record(name: string, result: Result, note?: string) {
  results.push({ name, result, note });
  console.log(`${result.padEnd(4)} ${name}${note ? ` — ${note}` : ""}`);
}

let demoId = "";
let aiBudgetFailure = false;

async function call<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<Frame<T>> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(demoId ? { "x-demo-user-id": demoId } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {}
  const retryAfter = Number(res.headers.get("retry-after") ?? "");
  return {
    status: res.status,
    json: parsed as T | null,
    retryAfter: Number.isFinite(retryAfter) ? retryAfter : undefined,
  };
}

/** An AI call that respects the real 5/min budget instead of fighting it. */
async function aiCall<T = unknown>(
  name: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<Frame<T> | null> {
  await new Promise((resolve) => setTimeout(resolve, PACE_MS));
  let response = await call<T>(method, path, body);
  if (response.status === 429) {
    const wait = (response.retryAfter ?? 30) + 1;
    console.log(`      (busy — waiting ${wait}s and retrying ${name})`);
    await new Promise((resolve) => setTimeout(resolve, wait * 1000));
    response = await call<T>(method, path, body);
  }
  if (response.status === 429 || response.status === 503) {
    aiBudgetFailure = true;
    record(name, "SKIP", `AI unavailable (${response.status})`);
    return null;
  }
  return response;
}

function check(name: string, condition: boolean, note?: string) {
  record(name, condition ? "PASS" : "FAIL", condition ? undefined : note);
}

const scopesWithin = (focuses: string[], allowed: Set<string>): string[] =>
  focuses.filter((focus) => !allowed.has(focus));

// ── the run ────────────────────────────────────────────────────────────────

console.log(`Phase 11 scope smoke test against ${API}\n`);

const room = await call<{ userId: string; chapterId: string }>(
  "POST",
  "/demo/start",
);
if (room.status !== 201 || !room.json) {
  record("demo room is created", "FAIL", `HTTP ${room.status}`);
  console.log("\nCannot continue without a demo room. Is the server running?");
  process.exit(1);
}
record("demo room is created", "PASS");
demoId = room.json.userId;
const chapterId = room.json.chapterId;

const unitsRes = await call<{ units: Unit[] }>(
  "GET",
  `/chapters/${chapterId}/units`,
);
const units = unitsRes.json?.units ?? [];
check(
  "GET /chapters/:id/units lists the chapter's sections",
  unitsRes.status === 200 && units.length > 0,
  `HTTP ${unitsRes.status}`,
);
if (units.length < 2) {
  record(
    "scope picker has more than one section to choose from",
    "SKIP",
    "the demo chapter has a single section",
  );
  console.log("\ndone (nothing to scope)");
  process.exit(0);
}
const inUnit = (key: string) =>
  new Set(units.find((unit) => unit.key === key)?.concepts ?? []);
console.log(
  `      sections: ${units.map((unit) => `${unit.key}(${unit.conceptCount})`).join(" ")}\n`,
);

const started = await call<{ sessionId: string }>("POST", "/sessions/start", {
  chapterId,
  recallMode: "both",
});
check("a session starts", started.status === 201, `HTTP ${started.status}`);
const sessionId = started.json?.sessionId;
if (!sessionId) {
  console.log("\nCannot continue without a session.");
  process.exit(1);
}

type SessionFrame = { scopeKeys: string[] | null; pretestIndex: number };
let session = await call<SessionFrame>("GET", `/sessions/${sessionId}`);
check(
  "a new session covers the whole chapter",
  session.json?.scopeKeys === null,
  JSON.stringify(session.json?.scopeKeys),
);

const first = units[0] as Unit;
const second = units[1] as Unit;
const setOne = await call<SessionFrame>(
  "PATCH",
  `/sessions/${sessionId}/scope`,
  {
    scopeKeys: [first.key],
  },
);
check(
  `PATCH scope selects ${first.key}`,
  JSON.stringify(setOne.json?.scopeKeys) === JSON.stringify([first.key]),
  JSON.stringify(setOne.json),
);

const dedupe = await call<SessionFrame>(
  "PATCH",
  `/sessions/${sessionId}/scope`,
  {
    scopeKeys: [second.key, "not-a-section", second.key],
  },
);
check(
  "duplicate and unknown keys are filtered out",
  JSON.stringify(dedupe.json?.scopeKeys) === JSON.stringify([second.key]),
  JSON.stringify(dedupe.json),
);

const stale = await call<SessionFrame>(
  "PATCH",
  `/sessions/${sessionId}/scope`,
  {
    scopeKeys: ["9.9", "not-a-section"],
  },
);
check(
  "a stale selection falls back to the whole chapter",
  stale.status === 200 && stale.json?.scopeKeys === null,
  JSON.stringify(stale.json),
);

await call("PATCH", `/sessions/${sessionId}/scope`, { scopeKeys: [first.key] });
session = await call<SessionFrame>("GET", `/sessions/${sessionId}`);
check(
  "the scope survives a reload",
  JSON.stringify(session.json?.scopeKeys) === JSON.stringify([first.key]),
  JSON.stringify(session.json?.scopeKeys),
);

const recall = await aiCall<{ questions: Question[] }>(
  "scoped recall only asks about the chosen section",
  "POST",
  `/sessions/${sessionId}/recall-questions`,
  { scope: "chapter", language: "en" },
);
if (recall) {
  const questions = recall.json?.questions ?? [];
  const strays = scopesWithin(
    questions.flatMap((question) => question.focus ?? []),
    inUnit(first.key),
  );
  check(
    "scoped recall only asks about the chosen section",
    questions.length > 0 && strays.length === 0,
    `${questions.length} questions, ${strays.length} out-of-scope focuses`,
  );
}

const locked = await call<SessionFrame>(
  "PATCH",
  `/sessions/${sessionId}/scope`,
  {
    scopeKeys: [second.key],
  },
);
check(
  "the scope locks once a test is prepared",
  locked.status === 409,
  `HTTP ${locked.status}`,
);

const pretest = await aiCall<{ questions: Question[] }>(
  "the baseline test is scoped too",
  "POST",
  `/sessions/${sessionId}/pretest`,
  { missing: [], misconceptions: [], language: "en" },
);
if (pretest) {
  const questions = pretest.json?.questions ?? [];
  const strays = scopesWithin(
    questions.flatMap((question) => question.focus ?? []),
    inUnit(first.key),
  );
  check(
    "the baseline test is scoped too",
    questions.length > 0 && strays.length === 0,
    `${questions.length} questions, ${strays.length} out-of-scope focuses`,
  );
}

const blocked = await call("POST", `/sessions/${sessionId}/recall-questions`, {
  scope: "chapter",
  language: "en",
});
check(
  "recall waits for the baseline to finish",
  blocked.status === 409,
  `HTTP ${blocked.status}`,
);

const answer = await aiCall<{ score: number }>(
  "a baseline answer is graded",
  "POST",
  `/sessions/${sessionId}/retest/answer`,
  {
    transcriptText:
      "A cell is the basic structural and functional unit of life. The nucleus stores DNA and controls the cell.",
    questionIndex: 0,
    stage: "pretest",
    language: "en",
  },
);
if (answer) {
  check(
    "a baseline answer is graded",
    answer.status === 200 && typeof answer.json?.score === "number",
    JSON.stringify(answer.json),
  );
  session = await call<SessionFrame>("GET", `/sessions/${sessionId}`);
  check(
    "the baseline question index advances",
    session.json?.pretestIndex === 1,
    String(session.json?.pretestIndex),
  );
  const result = await call<{ before: number | null; after: number | null }>(
    "GET",
    `/sessions/${sessionId}/result`,
  );
  check(
    "the result shows the baseline as 'before' and no 'after' yet",
    result.json?.before !== null && result.json?.after === null,
    JSON.stringify(result.json),
  );
}

const scopedGuide = await aiCall<{ sections: GuideSection[] }>(
  "the scoped guide stays inside the section",
  "GET",
  `/chapters/${chapterId}/guide?scope=${first.key}&language=en`,
);
if (scopedGuide) {
  const texts = (scopedGuide.json?.sections ?? []).map(
    (section) => section.conceptText,
  );
  const strays = texts.filter((text) => !inUnit(first.key).has(text));
  check(
    "the scoped guide stays inside the section",
    texts.length > 0 && strays.length === 0,
    `${texts.length} concepts, ${strays.length} out-of-scope`,
  );
}

const wholeGuide = await aiCall<{ sections: GuideSection[] }>(
  "an unscoped guide still covers other sections",
  "GET",
  `/chapters/${chapterId}/guide?language=en`,
);
if (wholeGuide) {
  const texts = (wholeGuide.json?.sections ?? []).map(
    (section) => section.conceptText,
  );
  const others = new Set(units.slice(1).flatMap((unit) => unit.concepts));
  const outside = texts.filter((text) => others.has(text));
  check(
    "an unscoped guide still covers other sections",
    outside.length > 0,
    `${texts.length} concepts, ${outside.length} from other sections`,
  );
}

// ── the queue (step 4c) ────────────────────────────────────────────────────

type QueueSession = {
  sessionId: string;
  chapterId: string;
  chapterTitle: string;
  position: number;
  status: "pending" | "in_progress" | "completed";
};
type QueueView = {
  queueId: string | null;
  items: { sessionId: string; chapterId: string; status: string }[];
  done: number;
};
type ChapterRow = {
  id: string;
  title: string;
  subject: string;
  textbookTitle: string;
};

// Three throwaway chapters, imported into the demo user's own book so the queue
// is the only thing being measured. Ingest does no model work (extraction is
// deferred until a chapter is studied), so this spend is free on a plan whose
// real constraint is AI calls per minute.
const listed = await call<ChapterRow[]>("GET", "/chapters");
const book = listed.json?.find((row) => row.id === chapterId);
const made: string[] = [];
if (book) {
  for (const label of ["A", "B", "C"]) {
    const ingest = await call<{ chapterId: string }>(
      "POST",
      "/chapters/ingest",
      {
        textbookTitle: book.textbookTitle,
        subject: book.subject,
        language: "en",
        title: `Smoke queue ${label} ${Date.now()}`,
        rawText: `A short chapter the smoke test uses to plan a queue (${label}).`,
      },
    );
    if (ingest.json?.chapterId) made.push(ingest.json.chapterId);
  }
}
check(
  "three chapters exist to plan a queue with",
  made.length === 3,
  `${made.length} of 3 imported`,
);

if (made.length === 3) {
  const [a, b, c] = made as [string, string, string];

  const planned = await call<{ queueId: string; sessions: QueueSession[] }>(
    "POST",
    "/sessions/queue",
    { chapterIds: [a, b, c] },
  );
  const slots = planned.json?.sessions ?? [];
  check(
    "POST /sessions/queue plans one session per chapter, in order",
    planned.status === 201 &&
      slots.length === 3 &&
      slots.every(
        (slot, i) => slot.position === i && slot.chapterId === [a, b, c][i],
      ),
    `HTTP ${planned.status}, ${slots.length} sessions`,
  );
  check(
    "the first queued chapter opens and the rest wait",
    slots[0]?.status === "in_progress" &&
      slots[1]?.status === "pending" &&
      slots[2]?.status === "pending",
    slots.map((slot) => slot.status).join(","),
  );
  const [first, second, third] = slots as [
    QueueSession,
    QueueSession,
    QueueSession,
  ];
  check(
    "each planned session carries its chapter's title",
    [first, second, third].every(
      (slot) => (slot?.chapterTitle ?? "").length > 0,
    ),
    "a queue with an unnamed chapter reads as blank rows",
  );

  if (first && second && third) {
    const history = await call<{ id: string }[]>("GET", "/sessions");
    const historyIds = new Set((history.json ?? []).map((row) => row.id));
    check(
      "a chapter that has not been opened is not in the history list",
      !historyIds.has(second.sessionId) && !historyIds.has(third.sessionId),
      "a pending chapter would show up as a past session",
    );

    const view = await call<QueueView>("GET", "/sessions/queue");
    check(
      "GET /sessions/queue returns the open plan in order",
      view.status === 200 &&
        (view.json?.items ?? []).length === 3 &&
        view.json?.items[0]?.sessionId === first.sessionId &&
        view.json?.items[2]?.sessionId === third.sessionId,
      `${(view.json?.items ?? []).length} items`,
    );

    const open = await call<{
      queueNext: { sessionId: string; chapterTitle: string } | null;
    }>("GET", `/sessions/${first.sessionId}`);
    check(
      "an open session names the chapter after it",
      open.json?.queueNext?.sessionId === second.sessionId &&
        (open.json?.queueNext?.chapterTitle ?? "").length > 0,
      "the result screen has nothing to hand over to",
    );

    const done = await call<{
      next: { sessionId: string; chapterTitle: string } | null;
    }>("POST", `/sessions/${first.sessionId}/complete`);
    check(
      "completing a queued chapter opens the next one and hands it back",
      done.status === 200 && done.json?.next?.sessionId === second.sessionId,
      `HTTP ${done.status}`,
    );

    const secondNow = await call<{ status: string; queueNext: unknown }>(
      "GET",
      `/sessions/${second.sessionId}`,
    );
    check(
      "the handed-over chapter is now in progress",
      secondNow.json?.status === "in_progress",
      `status ${secondNow.json?.status}`,
    );

    const drop = await call("DELETE", `/sessions/${third.sessionId}/queue`);
    check(
      "a chapter still waiting can be dropped from the queue",
      drop.status === 200,
      `HTTP ${drop.status}`,
    );

    const keepOpen = await call(
      "DELETE",
      `/sessions/${second.sessionId}/queue`,
    );
    const keepDone = await call("DELETE", `/sessions/${first.sessionId}/queue`);
    check(
      "a chapter already opened or finished cannot be dropped",
      keepOpen.status === 409 && keepDone.status === 409,
      `${keepOpen.status} / ${keepDone.status}`,
    );

    const afterDrop = await call<QueueView>("GET", "/sessions/queue");
    check(
      "the dropped chapter is gone and the finished one is counted",
      (afterDrop.json?.items ?? []).length === 1 &&
        afterDrop.json?.items[0]?.sessionId === second.sessionId &&
        afterDrop.json?.done === 1 &&
        !(afterDrop.json?.items ?? []).some(
          (item) => item.sessionId === third.sessionId,
        ),
      `${(afterDrop.json?.items ?? []).length} items, ${afterDrop.json?.done} done`,
    );
  }

  const duped = await call<{ sessions: QueueSession[] }>(
    "POST",
    "/sessions/queue",
    { chapterIds: [a, a, a] },
  );
  check(
    "planning the same chapter twice makes one session, not three",
    duped.status === 201 && (duped.json?.sessions ?? []).length === 1,
    `${(duped.json?.sessions ?? []).length} sessions`,
  );

  const empty = await call("POST", "/sessions/queue", { chapterIds: [] });
  const stranger = await call("POST", "/sessions/queue", {
    chapterIds: [crypto.randomUUID()],
  });
  check(
    "an empty queue and a chapter that isn't yours are both refused",
    empty.status === 400 && stranger.status === 404,
    `${empty.status} / ${stranger.status}`,
  );
}

// ── summary ────────────────────────────────────────────────────────────────

const passed = results.filter((entry) => entry.result === "PASS").length;
const failed = results.filter((entry) => entry.result === "FAIL").length;
const skipped = results.filter((entry) => entry.result === "SKIP").length;
console.log(
  `\n${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ""}`,
);
if (skipped) {
  console.log(
    aiBudgetFailure
      ? "Skipped checks were AI-budget refusals, not failures. Re-run later."
      : "Some checks were skipped.",
  );
}
process.exit(failed ? 1 : 0);
