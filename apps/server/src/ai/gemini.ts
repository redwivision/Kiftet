import { GoogleGenAI } from "@google/genai";

import { env } from "../env.server";

const genAI = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

export const DEFAULT_MODEL = "gemini-3.6-flash";

const PLACEHOLDER_KEY = "placeholder-gemini-api-key";

export type ConceptChecklistItem = {
  conceptText: string;
  isMisconception: boolean;
  weight: number;
};

/** The script/register generated student-facing text should be written in.
 *  Follows the app's language pref (bet 4 / phase 10, slice C). */
export type ContentLanguage = "en" | "am";

/** Per-concept mastery, the spine of phase 11.
 *  0 = not addressed, 1 = raised but not explained, 2 = explained WRONG
 *  (a misconception), 3 = explained correctly.
 *  A single scalar cannot carry this: one strong answer among nine concepts
 *  used to read as "that student knows the chapter". */
export type MasteryLevel = 0 | 1 | 2 | 3;

export type MasteryMap = Record<string, MasteryLevel>;

export type GapAnalysis = {
  covered: string[];
  missing: string[];
  misconceptions: string[];
  /** conceptText (verbatim from the checklist) -> level. The source of truth
   *  for every other field here. */
  mastery: MasteryMap;
  /** Weighted fraction of real concepts at level 1 or 3. Derived from
   *  `mastery`, never asked of the model, so the number is deterministic
   *  across the AI and fallback paths. */
  score: number;
  /** True when this came from the lexical fallback, which can see word overlap
   *  but cannot judge whether an explanation was correct. Every level is then a
   *  guess capped well below "mastered", and the UI must label the number as
   *  an estimate — a student must not be shown a quietly halved score because
   *  *we* hit a rate limit. */
  estimated: boolean;
};

export type MicroLesson = {
  text: string;
};

/**
 * One concept's teaching section — the unit the whole phase is built on.
 *
 * Deliberately NOT a student: it depends on the concept, the chapter text and
 * the language, and on nothing about who is asking. That is what lets it be
 * generated once and shared by every student who ever opens the chapter, which
 * is the only way this fits inside a per-project free-tier quota.
 *
 * `what` / `why` / `recall` replace the single lesson string so "the right
 * length" stops being a vibe: a student reads them in order, and each part can
 * be rendered or retested on its own later.
 */
export type GuideSection = {
  /** One or two sentences: the idea itself. */
  what: string;
  /** One sentence: why it matters or what it connects to. */
  why?: string;
  /** One say-it-back prompt. This is the part a voice UI can hand to a mic. */
  recall?: string;
  /** Deterministic anchor into the chapter's raw text. */
  sourceOffset?: number;
  sourceQuote?: string;
  /** True when built by the lexical fallback, not the model. */
  estimated: boolean;
};

/** An ordered, personalised guide: sections in the order this student needs. */
export type Guide = {
  sections: GuideSection[];
  /** Present when at least one section is a deterministic fallback. */
  estimated: boolean;
};

export type RetestQuestion = {
  question: string;
  targetConcept?: string;
};

export type AiService = {
  extractConcepts(rawText: string): Promise<ConceptChecklistItem[]>;
  gradeRecall(
    transcript: string,
    concepts: ConceptChecklistItem[],
  ): Promise<GapAnalysis>;
  generateMicroLesson(
    gaps: GapAnalysis,
    concepts: ConceptChecklistItem[],
    language?: ContentLanguage,
  ): Promise<MicroLesson>;
  /**
   * Teach one concept. Student-independent by construction — it is not given
   * any gap or mastery data, because if it were it could not be shared.
   */
  generateGuideSection(
    conceptText: string,
    chapterText: string,
    language?: ContentLanguage,
  ): Promise<GuideSection>;
  generateRetestQuestions(
    gaps: GapAnalysis,
    concepts: ConceptChecklistItem[],
    recallText?: string,
    language?: ContentLanguage,
  ): Promise<RetestQuestion[]>;
};

/** Rebuild a GapAnalysis from the flat gap lists a client sent.
 *
 *  The microlesson and retest routes only receive gap *names* from the browser,
 *  but generation now runs off the mastery map, so they cannot hand-build the
 *  object any more. This derives levels the same way grading does — a named gap
 *  is 0 (not demonstrated), a named misconception 2 — and recomputes the score,
 *  so a generated lesson keeps targeting exactly the gaps the grade found. */
export function gapAnalysisFrom(
  parts: { covered?: string[]; missing: string[]; misconceptions: string[] },
  concepts: ConceptChecklistItem[],
): GapAnalysis {
  const covered = parts.covered ?? [];
  const misconceptions = parts.misconceptions;
  const named = new Set(
    [...covered, ...misconceptions].map((c) => c.trim().toLowerCase()),
  );
  for (const name of parts.missing) {
    if (!name.trim()) continue;
    named.add(name.trim().toLowerCase());
  }
  // Concepts the client never mentioned are not gaps to teach, so they are left
  // out of the map rather than being asserted as unmastered.
  const scoped = concepts.filter((c) =>
    named.has(c.conceptText.trim().toLowerCase()),
  );
  const mastery = masteryFromLists(covered, misconceptions, scoped);
  const lists = listsFromMastery(mastery, scoped);
  return {
    mastery,
    covered: lists.covered,
    missing: lists.missing,
    misconceptions: lists.misconceptions,
    score: masteryScore(mastery, scoped),
    estimated: false,
  };
}

// ────────────────────────────────────────────────────────────────
// Fallback chain (the design's seam rule: the product must always work,
// with or without a key). If Gemini is unavailable or fails, we degrade to
// deterministic heuristics so demos and CI never hard-fail.
// ────────────────────────────────────────────────────────────────

function isAiAvailable(): boolean {
  return (
    env.GEMINI_API_KEY !== PLACEHOLDER_KEY &&
    env.GEMINI_API_KEY.trim().length > 0
  );
}

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 40);
}

function fallbackExtract(rawText: string): ConceptChecklistItem[] {
  return sentences(rawText)
    .slice(0, 8)
    .map((s) => ({
      conceptText: s,
      isMisconception: false,
      weight: 1,
    }));
}

function significantTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(
        (w) =>
          w.length > 3 &&
          !["this", "that", "with", "from", "they", "them", "have"].includes(w),
      ),
  );
}

// A concept counts as claimed only when the student actually addressed it —
// matching a single shared token ("current" for "current is used up in a
// resistor") would mark it covered far too cheaply. Require a majority of the
// concept's own tokens to appear.
function conceptLexicallyHit(
  nameTokens: Set<string>,
  tokens: Set<string>,
): boolean {
  if (!nameTokens.size) return false;
  const matched = [...nameTokens].filter((t) => tokens.has(t)).length;
  return matched >= Math.max(1, Math.ceil(nameTokens.size * 0.6));
}

// Score = fraction of non-misconception concepts *demonstrated*, weighted by
// each concept's importance (weight 1-5). A weight-5 idea counts five times as
// much as a weight-1 aside, so the number reflects what the chapter actually
// requires, not just how many titles were touched.
//
// Derived from the mastery map so per-concept and scalar can never disagree.
// A concept at level 2 (misconception) is NOT credited: a student who states
// a wrong belief has not demonstrated the concept. Previously a model that
// listed a concept in both `covered` and `misconceptions` still scored it as
// mastered, which hid exactly the signal this product exists to surface.
function masteryScore(
  mastery: MasteryMap,
  concepts: ConceptChecklistItem[],
): number {
  const real = concepts.filter((c) => !c.isMisconception);
  if (!real.length) return 1;
  const norm = normalizeMastery(mastery);
  let earned = 0;
  let total = 0;
  for (const concept of real) {
    total += concept.weight;
    const level = levelOf(norm, concept.conceptText);
    if (level === 1) earned += concept.weight * 0.5;
    else if (level === 3) earned += concept.weight;
  }
  return total ? Math.min(1, earned / total) : 1;
}

function normalizeMastery(mastery: MasteryMap): MasteryMap {
  const out: MasteryMap = {};
  for (const [key, value] of Object.entries(mastery)) {
    const name = key.trim();
    if (!name) continue;
    const level = Math.round(Number(value));
    if (!Number.isFinite(level) || level < 0 || level > 3) continue;
    out[name] = level as MasteryLevel;
  }
  return out;
}

const keyOf = (conceptText: string) => conceptText.trim().toLowerCase();

/** Read one concept's level, tolerating case/whitespace drift in the keys the
 *  model produced. Defaults to 0 ("not shown") — never to credit. */
/**
 * The one place a concept's level is read. Exported because the guide orders
 * sections by it: if triage and the diagnosis screen each resolved a concept
 * name their own way, a student could be told to revise an idea the screen had
 * already called solid.
 */
export function levelOf(
  mastery: MasteryMap,
  conceptText: string,
): MasteryLevel {
  const direct = mastery[keyOf(conceptText)];
  if (direct !== undefined) return direct;
  for (const [key, level] of Object.entries(mastery)) {
    if (keyOf(key) === keyOf(conceptText)) return level;
  }
  return 0;
}

/** Build a mastery map from the three flat lists, so the map is a total
 *  function over the checklist: every real concept has a level. */
function masteryFromLists(
  covered: string[],
  misconceptions: string[],
  concepts: ConceptChecklistItem[],
): MasteryMap {
  const mastery: MasteryMap = {};
  const name = (c: string) => c.trim();
  for (const concept of concepts) {
    const key = name(concept.conceptText);
    const wrong = misconceptions.some((m) => keyOf(m) === keyOf(key));
    const right = covered.some((c) => keyOf(c) === keyOf(key));
    // A misconception outranks a covered tick for the same concept: the wrong
    // belief is the thing to fix.
    mastery[key] = wrong ? 2 : right ? 3 : 0;
  }
  return mastery;
}

/** The three flat lists, derived from the mastery map, for the UI and the
 *  lesson/retest prompts. Misconceptions are excluded from `covered` so the
 *  student never sees a concept ticked off that they got wrong. */
function listsFromMastery(
  mastery: MasteryMap,
  concepts: ConceptChecklistItem[],
): { covered: string[]; missing: string[]; misconceptions: string[] } {
  const covered: string[] = [];
  const missing: string[] = [];
  const misconceptions: string[] = [];
  for (const concept of concepts) {
    const key = concept.conceptText.trim();
    const level = levelOf(mastery, key);
    if (level === 2) misconceptions.push(key);
    else if (concept.isMisconception) continue;
    else if (level >= 1) covered.push(key);
    else missing.push(key);
  }
  return { covered, missing, misconceptions };
}

// Deterministic path, also the shape the AI path degrades to. It can only see
// word overlap, so it never claims level 3 ("explained correctly") off a
// keyword hit — a bare mention is level 1, and a known misconception named is
// level 2. Under-crediting here is deliberate: the fallback must not inflate
// mastery it cannot see, or a degraded request would look like a good answer.
function fallbackGrade(
  transcript: string,
  concepts: ConceptChecklistItem[],
): GapAnalysis {
  const tokens = significantTokens(transcript);
  const mastery: MasteryMap = {};
  for (const concept of concepts) {
    const key = concept.conceptText.trim();
    const nameTokens = significantTokens(key);
    if (nameTokens.size === 0) {
      mastery[key] = 0;
      continue;
    }
    const hit = conceptLexicallyHit(nameTokens, tokens);
    mastery[key] = concept.isMisconception ? (hit ? 2 : 0) : hit ? 1 : 0;
  }
  const lists = listsFromMastery(mastery, concepts);
  return {
    mastery,
    covered: lists.covered,
    missing: lists.missing,
    misconceptions: lists.misconceptions,
    score: masteryScore(mastery, concepts),
    estimated: true,
  };
}

function fallbackLesson(
  gaps: GapAnalysis,
  language: ContentLanguage = "en",
): string {
  const targets = [...gaps.missing, ...gaps.misconceptions].slice(0, 3);
  if (!targets.length) {
    return language === "am"
      ? "በዚህ ክፍል ውስጥ ያሉትን ሃሳቦች በሙሉ አስቀድመህ ሸፍነሃል። በድምፅ በፍጥነት ጠቅለል አድርገህ ንገር፣ ከዚያም ወደፊት ቀጥል።"
      : "You already covered every idea in this section. Give yourself a quick recap out loud, then move on.";
  }
  const body = targets.map((t) => `“${t}”`).join("; ");
  if (language === "am") {
    return `ክፍተቶችህን እንዘጋ። ዛሬ በእነዚህ ላይ እናተኩራለን፦ ${body}። በጥንቃቄ አዳምጥ፦ ${targets[0]} — በቀላል ቃላት እንዲህ ነው፦ ትርጉሙን በግልጽ ይዘህ፣ ምሳሌውን ተጠቀም፣ እና በድምፅ ይድገመው። አሁን በራስህ መንገድ ግለፅልኝ።`;
  }
  return `Let’s close your gaps. Today we focus on ${body}. Listen closely: ${targets[0]}, in plain words — it is simply this: keep the definition clear, use the example, and say it back out loud. Now explain it to me your way.`;
}

function fallbackQuestions(
  gaps: GapAnalysis,
  language: ContentLanguage = "en",
): RetestQuestion[] {
  const targets = [...gaps.missing, ...gaps.misconceptions].slice(0, 3);
  return targets.map((t) => ({
    question:
      language === "am"
        ? `“${t}”ን በራስህ ቃላት ግለጽ — ጓደኛ እንደሆነ።`
        : `Explain “${t}” in your own words, as if teaching a friend.`,
    targetConcept: t,
  }));
}

// ────────────────────────────────────────────────────────────────
// Guide sections: the student-independent half
// ────────────────────────────────────────────────────────────────

/**
 * Anchor a concept back to the exact place in the chapter text.
 *
 * A study plan is only useful if it can hand the student *out* to their own
 * book, and that needs a location, not a vibe. This is computed, not asked of
 * the model, so it costs nothing and cannot hallucinate a page number.
 *
 * Picks the chapter sentence with the strongest lexical overlap with the
 * concept and returns its real character offset. Returns undefined when there
 * is nothing to point at, which is the honest answer for a chapter whose text
 * is empty or unrelated.
 */
export function sourceAnchor(
  conceptText: string,
  chapterText: string,
): { offset: number; quote: string } | undefined {
  if (!chapterText.trim() || !conceptText.trim()) return undefined;
  const want = significantTokens(conceptText);
  if (!want.size) return undefined;

  let best: { offset: number; quote: string; score: number } | undefined;
  // Newlines are NOT sentence boundaries. Textbook text is hard-wrapped, so
  // splitting on them produced anchors like "Inside, the cytoplasm is a
  // watery fluid that holds the" — a fragment that is useless both as a
  // "go to this place in your book" link and as the section's own text.
  // Split on terminal punctuation only, and render the quote with its internal
  // whitespace collapsed while the offset still indexes the original text.
  for (const match of chapterText.matchAll(/[^.!?]+[.!?]*/g)) {
    const span = match[0];
    // The regex keeps the whitespace that precedes a sentence. Trim the quote
    // AND move the offset by however much was trimmed, or the anchor points at
    // the space before the sentence and a "go to this place in your book" link
    // lands one word early.
    const quote = span.replace(/\s+/g, " ").trim();
    if (quote.length < 24) continue;
    const lead = span.length - span.trimStart().length;
    const have = significantTokens(quote);
    const shared = [...want].filter((t) => have.has(t)).length;
    if (!shared) continue;
    // Normalise by concept size: a long concept should not need a long chapter
    // sentence to look relevant, and a one-word concept should not match
    // everything. Ties go to the earliest mention, which reads as "introduced
    // here".
    const score = shared / Math.sqrt(want.size);
    if (!best || score > best.score) {
      best = { offset: (match.index ?? 0) + lead, quote, score };
    }
  }
  return best ? { offset: best.offset, quote: best.quote } : undefined;
}

/**
 * Step 2 of the reliability ladder: the section without the model.
 *
 * The deterministic path cannot translate and cannot teach, so it does not
 * pretend to. Copying the chapter's sentence into `what` produced an ENGLISH
 * "section" inside a guide that had already claimed `language: "am"` — the one
 * thing an honest fallback must not do. So `what` is target-language scaffolding
 * that points at the concept, and the book's own words are carried separately
 * in `sourceQuote`, where the UI labels them as coming from the text. A
 * student whose book is in another language still gets their scaffolding in
 * their language and their book quoted verbatim.
 *
 * Marked `estimated` so the UI can say the wording is ours.
 */
function fallbackSection(
  conceptText: string,
  chapterText: string,
  language: ContentLanguage = "en",
): GuideSection {
  const anchor = sourceAnchor(conceptText, chapterText);
  return {
    what:
      language === "am"
        ? `“${conceptText}” — ከዚህ ታች ባለው ክፍል ይሸፍናል።`
        : `“${conceptText}” — the part of your book below covers it.`,
    why:
      language === "am"
        ? "የመጽሐፍውን ተያያዝ አጥናጋይ በመንገር የራስህን ግለጽ።"
        : "Find it in your book and say it back in your own words.",
    recall:
      language === "am"
        ? `“${conceptText}”ን በራስህ ቃላት ግለጽ — ጓደኛ እንደሆነ።`
        : `Explain “${conceptText}” in your own words, as if teaching a friend.`,
    sourceOffset: anchor?.offset,
    sourceQuote: anchor?.quote,
    estimated: true,
  };
}

/**
 * Study order, from mastery. Deterministic on purpose: same map in, same guide
 * out, with no AI call, so ordering can never disagree between two students who
 * happen to have the same diagnosis, and it costs nothing.
 *
 * Misconceptions first — a wrong belief is the one thing re-reading does not
 * fix. Then level 1, the cheapest win. Then untouched concepts by importance.
 * A misconception checklist item is a *wrong belief*, not a concept, so it
 * never gets a section of its own; it is addressed where it appears among the
 * real concepts.
 */
export function triageConcepts(
  concepts: ConceptChecklistItem[],
  mastery: MasteryMap,
): ConceptChecklistItem[] {
  const rank = (c: ConceptChecklistItem) => levelOf(mastery, c.conceptText);
  return concepts
    .filter((c) => !c.isMisconception)
    .map((concept, i) => ({ concept, i }))
    .sort((a, b) => {
      // Tier: 2 (wrong) → 1 (unraised) → 0 (untouched) → 3 (solid, last).
      const tier = (l: MasteryLevel) =>
        l === 2 ? 0 : l === 1 ? 1 : l === 0 ? 2 : 3;
      const byTier = tier(rank(a.concept)) - tier(rank(b.concept));
      if (byTier !== 0) return byTier;
      // Within a tier, importance decides.
      if (b.concept.weight !== a.concept.weight)
        return b.concept.weight - a.concept.weight;
      // Ties keep checklist order, so the guide is stable rather than
      // reshuffling on an unstable sort between requests.
      return a.i - b.i;
    })
    .map((x) => x.concept);
}

// ────────────────────────────────────────────────────────────────
// Gemini helpers
// ────────────────────────────────────────────────────────────────

function clampWeight(weight: unknown): number {
  const n = typeof weight === "number" ? weight : 1;
  return Math.min(5, Math.max(1, Math.round(n)));
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );
}

function parseJson<T>(raw: string): T | null {
  const cleaned = raw.replace(/```json|```/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

// A stalled Gemini call must never hang a student session: after this the
// promise rejects, the per-method catch falls back, and the UI keeps moving.
const GEMINI_TIMEOUT_MS = 20_000;

// Retries share ONE wall-clock budget rather than getting a fresh full timeout
// each. Three 20s attempts would be 60s+ of hanging, which blows past the 30s
// client fetch timeout in `api.ts` and turns a transient blip into a hard error
// page. Each attempt gets whatever is left of the budget, so the retry path
// stays inside the client window (24s of calls + backoff vs 30s) with a little
// headroom. Raise GEMINI_TOTAL_BUDGET_MS only if that client timeout moves.
const GEMINI_TOTAL_BUDGET_MS = 24_000;
const GEMINI_MAX_ATTEMPTS = 3;

// Only transient conditions are retried. A 400 (malformed request) or 404 will
// fail identically every time, and retrying it just burns quota we have per
// project, not per user.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const RETRY_BASE_DELAY_MS = 500;

/** The Gemini SDK surfaces the HTTP status on `ApiError.status`; be defensive
 *  because a timeout rejection from `withTimeout` is a plain `Error`. */
function statusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

function isRetryable(error: unknown): boolean {
  const status = statusOf(error);
  return status !== undefined && RETRYABLE_STATUS.has(status);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Gemini request timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// Why the product is currently degraded to deterministic fallbacks. A 429 is
// the failure to expect: the Gemini free tier is per *project* (~10 req/min,
// ~1-1.5k/day) and we are explicitly not paying until real users prove the
// case, so our own per-user allowance is deliberately set below it.
const aiTelemetry = {
  attempts: 0,
  retries: 0,
  rateLimited: 0,
  timeouts: 0,
  malformed: 0,
  failed: 0,
};

export function aiTelemetrySnapshot() {
  return { ...aiTelemetry };
}

async function askJson(
  systemPrompt: string,
  userInput: string,
): Promise<string> {
  const deadline = Date.now() + GEMINI_TOTAL_BUDGET_MS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt++) {
    const remaining = deadline - Date.now();
    // Out of wall clock: a timeout, not a provider fault. Fall back rather
    // than starting an attempt that cannot finish inside the client window.
    if (remaining <= 0) {
      lastError = new Error("Gemini retry budget exhausted");
      break;
    }
    aiTelemetry.attempts += 1;
    try {
      const response = await withTimeout(
        genAI.models.generateContent({
          model: DEFAULT_MODEL,
          contents: [
            {
              role: "user",
              parts: [{ text: `${systemPrompt}\n\n---\n${userInput}` }],
            },
          ],
          config: { responseMimeType: "application/json", temperature: 0.4 },
        }),
        Math.min(GEMINI_TIMEOUT_MS, remaining),
      );
      return response.text ?? "";
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === GEMINI_MAX_ATTEMPTS) break;
      // Jitter matters here: many students hit the same per-project ceiling at
      // the same moment, and fixed backoff would have them all retry in
      // lockstep and re-trip the 429 immediately.
      const delay =
        RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) + Math.random() * 250;
      aiTelemetry.retries += 1;
      await sleep(Math.min(delay, Math.max(0, deadline - Date.now())));
    }
  }

  const status = statusOf(lastError);
  if (status === 429) aiTelemetry.rateLimited += 1;
  else if (
    lastError instanceof Error &&
    lastError.message.includes("timed out")
  )
    aiTelemetry.timeouts += 1;
  throw lastError instanceof Error
    ? lastError
    : new Error("Gemini request failed");
}

function extractItems(raw: string): ConceptChecklistItem[] | null {
  const data = parseJson<{ items?: unknown[] }>(raw);
  if (!data || !Array.isArray(data.items)) return null;
  const items: ConceptChecklistItem[] = [];
  for (const item of data.items) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    if (typeof o.conceptText !== "string" || !o.conceptText.trim()) continue;
    items.push({
      conceptText: o.conceptText.trim(),
      isMisconception: o.isMisconception === true,
      weight: clampWeight(o.weight),
    });
  }
  return items.length ? items.slice(0, 12) : null;
}

function parseGaps(
  raw: string,
  concepts: ConceptChecklistItem[],
): GapAnalysis | null {
  const data = parseJson<Partial<GapAnalysis>>(raw);
  if (!data) return null;
  return sanitizeGaps(
    {
      covered: strings(data.covered),
      missing: strings(data.missing),
      misconceptions: strings(data.misconceptions),
      mastery: readMastery(data.mastery),
      // Ignored on purpose: the score is recomputed from the levels below.
      score: 0,
      estimated: false,
    },
    concepts,
  );
}

// The model's mastery object is untrusted input: it may hold non-numbers, keys
// that are not checklist concepts, or levels outside 0-3. normalizeMastery
// drops the unusable ones, and sanitizeGaps fills the rest from the three flat
// lists, so a bad object degrades to the old behaviour instead of throwing.
function readMastery(value: unknown): MasteryMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return normalizeMastery(value as Record<string, unknown> as MasteryMap);
}

// Keep AI output consistent with the stored concept list: fuzzy-match returned
// names back to the canonical conceptText so downstream lookups always agree.
function sanitizeGaps(
  gaps: GapAnalysis,
  concepts: ConceptChecklistItem[],
): GapAnalysis {
  const match = (value: string) => {
    const lower = value.trim().toLowerCase();
    return (
      concepts.find((c) => c.conceptText.trim().toLowerCase() === lower)
        ?.conceptText ?? value.trim()
    );
  };
  // Snap every concept the model named onto the checklist's exact spelling, so
  // a drifted key can't silently open a hole in the mastery map.
  const covered = [...new Set(gaps.covered.map(match))].filter(Boolean);
  const misconceptions = [...new Set(gaps.misconceptions.map(match))].filter(
    Boolean,
  );
  // A checklist item the model neither covered nor called a misconception was
  // not demonstrated, so it enters the map at 0 rather than being absent.
  // Only near-misses the model flagged as "raised" (level 1) come from the
  // model's own mastery object.
  const nearMisses = Object.entries(
    normalizeMastery(gaps.mastery ?? {}),
  ).filter(([, level]) => level === 1);
  const named = new Set(
    [...covered, ...misconceptions].map((c) => c.trim().toLowerCase()),
  );
  for (const [name] of nearMisses) {
    if (named.has(name.trim().toLowerCase())) continue;
    const concept = concepts.find(
      (c) => c.conceptText.trim().toLowerCase() === name.trim().toLowerCase(),
    );
    if (concept && !concept.isMisconception) covered.push(concept.conceptText);
  }
  const mastery = masteryFromLists(covered, misconceptions, concepts);
  for (const [name, level] of nearMisses) {
    const key = name.trim();
    if (mastery[key] === 0) mastery[key] = level;
  }
  const lists = listsFromMastery(mastery, concepts);
  return {
    mastery,
    covered: lists.covered,
    missing: lists.missing,
    misconceptions: lists.misconceptions,
    score: masteryScore(mastery, concepts),
    estimated: false,
  };
}

function conceptsChecklist(concepts: ConceptChecklistItem[]): string {
  return concepts
    .map(
      (c) =>
        `- ${c.conceptText}${c.isMisconception ? " [MISCONCEPTION]" : ""} (weight ${c.weight})`,
    )
    .join("\n");
}

function gapsSummary(gaps: GapAnalysis): string {
  return [
    `Covered: ${gaps.covered.length ? gaps.covered.join("; ") : "none"}`,
    `Missing: ${gaps.missing.length ? gaps.missing.join("; ") : "none"}`,
    `Misconceptions: ${gaps.misconceptions.length ? gaps.misconceptions.join("; ") : "none"}`,
  ].join("\n");
}

// ────────────────────────────────────────────────────────────────
// The service
// ────────────────────────────────────────────────────────────────

// Per-question verdict score: a misconception counts as handled when the student
// does NOT restate the wrong belief; a real concept counts when it shows up in
// the covered set. This gives a fraction 0-1 that maps to "right/still open"
// for the individual retest question.
export function focusScore(
  gaps: { covered: string[]; misconceptions: string[] },
  concepts: ConceptChecklistItem[],
): number {
  if (!concepts.length) return 1;
  const covered = new Set(gaps.covered.map((c) => c.trim().toLowerCase()));
  const restated = new Set(
    gaps.misconceptions.map((c) => c.trim().toLowerCase()),
  );
  let numerator = 0;
  let denominator = 0;
  for (const concept of concepts) {
    denominator += concept.weight;
    const name = concept.conceptText.trim().toLowerCase();
    if (concept.isMisconception) {
      // Correct when the student does NOT restate the wrong belief.
      if (!restated.has(name)) numerator += concept.weight;
    } else {
      if (covered.has(name)) numerator += concept.weight;
    }
  }
  return denominator ? numerator / denominator : 1;
}

const EXTRACT_SYSTEM =
  "Extract the core concepts someone must understand to master this chapter. " +
  "Return STRICT JSON, no prose, in this exact shape: " +
  '{"items":[{"conceptText":"short self-contained phrase (5-15 words, as the student would say it)","weight":1-5,"isMisconception":false}]}. ' +
  "Include common student MISCONCEPTIONS as separate items (isMisconception true, phrased as the WRONG belief). " +
  "Return 5-10 items, only what is actually in the text.";

const GRADE_SYSTEM =
  "You judge how well a student's spoken recall covers the concept checklist. " +
  "Return STRICT JSON, no prose: " +
  '{"mastery":{"<exact conceptText>":0|1|2|3},"covered":["conceptText the student correctly explained"],"missing":["checklist concepts not really addressed"],"misconceptions":["checklist items the student got WRONG or stated as a misconception"]}. ' +
  "Judge EVERY checklist concept, including ones the student never raised, and set one level for each: " +
  "0 = not addressed at all, 1 = raised but not really explained, 2 = explained WRONG (a misconception), 3 = explained correctly. " +
  "Most gaps are 0, and 3 is the hardest to earn: reserve it for a real explanation, not a passing mention. " +
  "Keys must be the conceptText exactly as it appears in the checklist, bare (never the [MISCONCEPTION] marker). " +
  "Keep 'covered', 'missing' and 'misconceptions' consistent with those levels (covered = 3, misconceptions = 2, missing = 0 or 1). " +
  "Do NOT output 'score': the system computes it from the levels, weighting each concept by its importance. " +
  "A misconception item listed in 'covered' is an error — it goes to 'misconceptions' instead.";

const LESSON_SYSTEM =
  "Write a short PRONUNCIATION-FRIENDLY lesson that fixes exactly the gaps in the GapAnalysis. " +
  "This will be read aloud by a voice engine, so write crisp short sentences designed to be spoken and remembered, " +
  "no headers, no markdown, no bullet lists, 4-8 sentences total, one plain analogy, ends with a one-line recall prompt to the student. " +
  'Return STRICT JSON: {"text":"the lesson"}.';

const SECTION_SYSTEM =
  "You teach ONE concept to a Grade 12 student revising this chapter. " +
  "Return STRICT JSON, no prose, no markdown: " +
  '{"what":"1-2 sentences stating the idea itself, in plain words","why":"1 sentence on why it matters or what it connects to","recall":"1 question asking the student to say it back in their own words"}. ' +
  "Rules that matter more than they look: " +
  "- Every sentence will be READ ALOUD by a voice engine, so write for the ear: short clauses, no headers, no bullets, no symbols, no parentheses. " +
  "- 'what' must stand alone. A student who reads only this line should be able to explain the concept to a friend. " +
  "- 'recall' must ask for an explanation, not a yes/no or multiple choice. " +
  "- Do not mention the student, their grade, their mistakes, or what they got wrong: this section is written ONCE and read by every student who opens this chapter, " +
  "including students who have no gap here at all. Teach the concept; do not coach a specific person. " +
  "- Do not invent facts, page numbers, or examples that are not in the text below.";

const RETEST_SYSTEM =
  "Write 2-3 short spoken check questions that re-test exactly the missing/misconception items in the GapAnalysis. " +
  "Each question must ask the student to speak aloud an explanation, definition, or worked example — not pick an option. " +
  "Each question targets exactly ONE gap item: set targetConcept to the exact conceptText of that item " +
  "(bare conceptText, never the [MISCONCEPTION] marker), so the answer is graded only against that idea. " +
  "If the student's own recall is provided, mirror their wording — reuse the terms, framing, and examples they actually used " +
  "so each question reads as a direct follow-up to what they said, not a canned quiz. Never quote their recall back as a statement, " +
  "and never treat a wrong belief they stated as correct; only echo their phrasing. " +
  'Return STRICT JSON: {"questions":[{"question":"...","targetConcept":"<one exact gap conceptText>"}]}.';

// Bet 4 / phase 10, slice C: generated content follows the app's language
// pref. Concept names are DATA (they come from the chapter's own checklist,
// in whatever script that book was written) — the model must keep them
// verbatim and write everything else in the requested language.
const AMHARIC_OUTPUT =
  "\n\nOUTPUT LANGUAGE: Write all student-facing text in Amharic, using the Ge'ez (Ethiopic) script, e.g. ተናገር and ምዕራፍ. " +
  "Concept and idea names taken from the source material are DATA — keep them verbatim in their original script, quoted, and never translate them. " +
  "Write everything else (sentences, instructions, your prompts back to the student) in Amharic.";

function outputInstruction(language: ContentLanguage): string {
  return language === "am" ? AMHARIC_OUTPUT : "";
}

// The retest user prompt. When the student's own recall is available it is
// appended so the writer can mirror their wording. Exported so the
// recall-echo behaviour is directly testable without a live model.
export function retestUserPrompt(
  gaps: GapAnalysis,
  recallText?: string,
): string {
  const recall = recallText?.trim();
  const base = `GAP ANALYSIS:\n${gapsSummary(gaps)}`;
  return recall
    ? `${base}\n\nSTUDENT'S OWN RECALL (mirror their wording):\n${recall.slice(0, 8000)}`
    : base;
}

// Pull a question list out of the model reply, carrying each question's target
// concept when the model converged on one (it is validated against the stored
// checklist by the route, never trusted blindly).
function extractQuestions(raw: string): RetestQuestion[] | null {
  const data = parseJson<{ questions?: unknown[] }>(raw);
  if (!data || !Array.isArray(data.questions)) return null;
  const out: RetestQuestion[] = [];
  for (const q of data.questions) {
    if (typeof q !== "object" || q === null) continue;
    const record = q as Record<string, unknown>;
    const question = record.question;
    if (typeof question !== "string" || !question.trim()) continue;
    out.push({
      question: question.trim(),
      targetConcept:
        typeof record.targetConcept === "string" && record.targetConcept.trim()
          ? record.targetConcept.trim()
          : undefined,
    });
    if (out.length >= 3) break;
  }
  return out.length ? out : null;
}

/** The model answered, but the answer was unusable (not JSON, or JSON that
 *  failed validation). Distinct from a transport failure: this one is worth
 *  watching as a quality signal, not just an availability one. */
function malformed<T>(operation: string, fallback: () => T): T {
  aiTelemetry.malformed += 1;
  console.error(`[ai] ${operation} got an unusable response, using fallback`);
  return fallback();
}

/** Every degraded path funnels through here so a fallback is never silent.
 *  Previously each method did `catch { return fallback(); }` with no logging
 *  and no counter, which meant a student being served the deterministic
 *  fallback — and us paying for nothing — looked identical to success. */
function degraded<T>(operation: string, error: unknown, fallback: () => T): T {
  const status = statusOf(error);
  const reason =
    status === 429
      ? "rate_limited (429)"
      : status !== undefined
        ? `upstream_status_${status}`
        : "timeout_or_network";
  aiTelemetry.failed += 1;
  console.error(
    `[ai] ${operation} degraded to deterministic fallback: ${reason}`,
    error instanceof Error ? error.message : error,
  );
  return fallback();
}

export const ai: AiService = {
  async extractConcepts(rawText: string): Promise<ConceptChecklistItem[]> {
    const fallback = () => fallbackExtract(rawText);
    if (!isAiAvailable()) return fallback();
    try {
      const raw = await askJson(
        EXTRACT_SYSTEM,
        `CHAPTER TEXT:\n${rawText.slice(0, 24000)}`,
      );
      return extractItems(raw) ?? malformed("extractConcepts", fallback);
    } catch (error) {
      return degraded("extractConcepts", error, fallback);
    }
  },

  async gradeRecall(
    transcript: string,
    concepts: ConceptChecklistItem[],
  ): Promise<GapAnalysis> {
    const fallback = () => fallbackGrade(transcript, concepts);
    if (!isAiAvailable()) return fallback();
    try {
      const raw = await askJson(
        GRADE_SYSTEM,
        `CONCEPT CHECKLIST:\n${conceptsChecklist(concepts)}\n\nSTUDENT RECALL:\n${transcript}`,
      );
      return parseGaps(raw, concepts) ?? malformed("gradeRecall", fallback);
    } catch (error) {
      return degraded("gradeRecall", error, fallback);
    }
  },

  async generateMicroLesson(
    gaps: GapAnalysis,
    _concepts: ConceptChecklistItem[],
    language: ContentLanguage = "en",
  ): Promise<MicroLesson> {
    const fallback = () => ({ text: fallbackLesson(gaps, language) });
    if (!isAiAvailable()) return fallback();
    try {
      const raw = await askJson(
        LESSON_SYSTEM + outputInstruction(language),
        `GAP ANALYSIS:\n${gapsSummary(gaps)}`,
      );
      const data = parseJson<Partial<MicroLesson>>(raw);
      if (data && typeof data.text === "string" && data.text.trim())
        return { text: data.text.trim() };
      return malformed("generateMicroLesson", fallback);
    } catch (error) {
      return degraded("generateMicroLesson", error, fallback);
    }
  },

  async generateGuideSection(
    conceptText: string,
    chapterText: string,
    language: ContentLanguage = "en",
  ): Promise<GuideSection> {
    // The anchor is computed, not generated: a model asked for a location in
    // the text invents one, and an invented page number is worse than none.
    const anchor = sourceAnchor(conceptText, chapterText);
    const fallback = (): GuideSection =>
      fallbackSection(conceptText, chapterText, language);
    if (!isAiAvailable()) return fallback();
    try {
      const raw = await askJson(
        SECTION_SYSTEM + outputInstruction(language),
        `CONCEPT TO TEACH:\n${conceptText.trim()}\n\nCHAPTER TEXT (the only source of facts):\n${chapterText.trim()}`,
      );
      const data = parseJson<Record<string, unknown>>(raw);
      const what =
        data && typeof data.what === "string" ? data.what.trim() : "";
      // A section is only worth storing if it teaches something. Without `what`
      // we keep the lexical fallback rather than persisting a stub that every
      // future student would then read as if it were a real lesson.
      if (!what || !data) return malformed("generateGuideSection", fallback);
      const clean = (v: unknown) =>
        typeof v === "string" && v.trim() ? v.trim() : undefined;
      return {
        what,
        why: clean(data.why),
        recall: clean(data.recall),
        sourceOffset: anchor?.offset,
        sourceQuote: anchor?.quote,
        estimated: false,
      };
    } catch (error) {
      return degraded("generateGuideSection", error, fallback);
    }
  },

  async generateRetestQuestions(
    gaps: GapAnalysis,
    _concepts: ConceptChecklistItem[],
    recallText?: string,
    language: ContentLanguage = "en",
  ): Promise<RetestQuestion[]> {
    const fallback = () => fallbackQuestions(gaps, language);
    if (!isAiAvailable()) return fallback();
    try {
      const raw = await askJson(
        RETEST_SYSTEM + outputInstruction(language),
        retestUserPrompt(gaps, recallText),
      );
      return (
        extractQuestions(raw) ?? malformed("generateRetestQuestions", fallback)
      );
    } catch (error) {
      return degraded("generateRetestQuestions", error, fallback);
    }
  },
};
