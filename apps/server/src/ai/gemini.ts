import { GoogleGenAI } from "@google/genai";
import { env } from "../env.server";
import {
  type AiProvider,
  admissionSnapshot,
  admitAiCall,
  isAiBusy,
} from "./admission";
import { fallbackObjectives } from "./objectives";
import {
  READING_WORDS_PER_MINUTE,
  STUDY_PLAN_CONTENT_BUDGET_MS,
  STUDY_PLAN_DEFAULT_BUDGET,
  STUDY_PLAN_MAX_STEPS,
} from "./plan-config";
import {
  COGNITIVE_LEVELS,
  type CognitiveLevel,
  fallbackLevels,
  isCognitiveLevel,
  isRecallFormat,
  judgeClosedAnswer,
  type QuestionKind,
  RECALL_FORMATS,
  RECALL_SET_SIZE,
  type RecallFormat,
  recallFormatCounts,
  recallFormatPlan,
  recallLevelDirective,
  retestIsSoft,
  retestLevelDirective,
} from "./questions";
import type { SubjectFamily } from "./subject-strategy";
import { getFamily, getPhaseDirectives } from "./subject-strategy";

const genAI = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

/**
 * The model, and the fallback order behind it.
 *
 * Chosen by measurement, not preference. `gemini-3.6-flash` (the previous
 * default) returned `503 UNAVAILABLE — high demand` on *every* attempt while
 * probing, and the 3.x flash family (3.5 / 3.7 / 3.8 / `flash-latest`) all did
 * the same. `gemini-2.5-flash` answered every prompt and, through the real
 * endpoints, graded a spoken transcript with 10/10 exact concept keys and
 * correct levels, and wrote 8/10 guide sections in English and Amharic.
 *
 * The older `2.5-flash-lite`, `2.0-flash` and `1.5-flash` are gone — the API
 * returns 404 "no longer available" for all three, so they are not options.
 *
 * The list is ordered by measured reliability, and the ladder is walked on a
 * 429/503/timeout: one wasted call is cheaper than a student who gets the
 * deterministic fallback because the model we picked was busy.
 *
 * Note the free tier is 5 requests/minute for this model, which is a real
 * ceiling on a cold 10-concept guide — see the guide cache, which exists for
 * exactly this reason.
 */
export const MODEL_FALLBACKS = [
  "gemini-2.5-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
] as const;

export const DEFAULT_MODEL = MODEL_FALLBACKS[0];

/**
 * The failover provider, one rung below Google in the ladder.
 *
 * Its job is the step the Gemini ladder cannot do: a Gemini free-tier quota is
 * perc-project and exhausts, and every attempt after that is a sure 429 that
 * only manufactures latency. When Gemini is exhausted its own breaker opens
 * (see admission.ts) and the ladder skips THESE models and hands the request
 * to Groq instead, which draws on a *separate* free quota at its own rate.
 * Only when both providers are down does a student see the deterministic
 * fallback or the honest "busy" refusal.
 *
 * `openai/gpt-oss-120b` is the general-purpose rung: it has reliable JSON
 * mode, handles Amharic, and its free tier (~30 req/min) comfortably absorbs
 * the 5/minute that Gemini's breaker would leave behind. It is named from a
 * live /v1/models listing (this account's Groq plan carries no llama entry).
 */
export const GROQ_MODELS = ["openai/gpt-oss-120b"] as const;

export const DEFAULT_GROQ_MODEL = GROQ_MODELS[0];

const GROQ_MAX_ATTEMPTS = GROQ_MODELS.length + 1;

/** Groq's OpenAI-compatible endpoint. No SDK dependency — one POST, the same
 *  shape the rest of the seam already parses. */
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

export type ConceptChecklistItem = {
  conceptText: string;
  isMisconception: boolean;
  weight: number;
};

/** One of the book's own stated learning objectives for a chapter. */
export type ObjectiveItem = {
  objectiveText: string;
  /** Deterministic anchor into the chapter's raw text, when one could be
   *  found. Computed, never asked of the model. */
  sourceOffset?: number;
  sourceQuote?: string;
};

/** What one read of a chapter yields: the concept checklist and the book's own
 *  stated objectives. They are extracted together because both are paid for by
 *  the same model call — the free tier is per *project*, so a chapter read
 *  costs one request whether it returns one list or two. */
export type ChapterExtraction = {
  concepts: ConceptChecklistItem[];
  objectives: ObjectiveItem[];
  /** True when this read came from the deterministic fallback rather than the
   *  model, so objectives built from guesswork are stored `estimated` and the
   *  UI can say their wording is ours. */
  estimated: boolean;
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
  /** Exact recall spans matched to concepts for personalised study steps. */
  evidence?: Record<string, string | null>;
};

export type MicroLesson = {
  text: string;
};

/**
 * One gap-specific step in the student's study plan.
 *
 * A step is a *route*, not a lesson: it tells the student why this gap is
 * theirs, what to do about it, and hands them a ready-made search — never a
 * question to answer. Testing belongs to the retest; the plan only points.
 */
export type StudyPlanStep = {
  /** Exact conceptText from the checklist. */
  concept: string;
  gapType: "missing" | "misconception";
  weight: number;
  masteryLevel: MasteryLevel;
  estimatedMinutes: number;
  anchor: {
    chapter: string;
    heading: string | null;
    page: number | null;
    offset: number;
    excerpt: string;
  };
  /** One short line: why this step comes here FOR THIS STUDENT. Model-written
   *  when available, the deterministic diagnosis line otherwise. */
  whyFirst: string;
  /** Localized action verb: Learn it / Complete it / Tell them apart. */
  action: string;
  /** A subject-shaped search query for YouTube/Google. */
  searchQuery: string;
  studentWords: string | null;
};

/** A personalized study roadmap over the student's gaps. */
export type StudyPlan = {
  steps: StudyPlanStep[];
  nextSession: string[];
  skippedKnown: {
    count: number;
    estimatedTimeSavedMinutes: number;
  };
  budgetMinutes: number;
  estMinutes: number;
  estimated: boolean;
};

/** One plan step whose "why this is yours" line still needs writing. The
 *  diagnosis travels with it so the line reflects the gap, not the topic. */
export type PlanWhyRequest = {
  conceptText: string;
  gapType: StudyPlanStep["gapType"];
  masteryLevel: MasteryLevel;
  studentWords: string | null;
  excerpt: string;
};

export type PlanArchetype =
  | "PROCESS"
  | "CAUSAL"
  | "PLACE_SYSTEM"
  | "PRINCIPLE"
  | "LANGUAGE"
  | "GENERIC";

export type SubjectFamilyContext = {
  subject: string;
  family: import("./subject-strategy").SubjectFamily;
  archetype: PlanArchetype;
};

/**
 * One concept's guide section — the unit the whole phase is built on.
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

/**
 * One generated question, from either writer (recall or retest).
 *
 * `level` is the cognitive level the writer tagged it with — the shared
 * standard (knowledge / comprehension / application / critical_thinking /
 * compare_contrast). `targetConcept` is the exact conceptText the answer is
 * graded against, and `targetObjective` the book objective it serves, both
 * reconciled against stored rows by the route rather than trusted. `beyondText`
 * marks a retest question that deliberately asks the student to reason about a
 * scenario the chapter does not cover — the exam-readiness half of the retest.
 */
export type GeneratedQuestion = {
  question: string;
  level: CognitiveLevel;
  targetConcept?: string;
  targetObjective?: string;
  beyondText?: boolean;
  /**
   * Recall only: how the student answers. Multiple choice and fill-in-the-blank
   * are graded deterministically (`answer` below); short answer is spoken and
   * graded by the model, as recall has always been. Retest leaves this unset and
   * stays free-form.
   */
  format?: RecallFormat;
  /** Recall multiple choice only: the choices, the answer among them. */
  options?: string[];
  /** Recall closed formats only: the expected answer, never sent to the client. */
  answer?: string;
};

/** Back-compat alias: a retest question is just a generated one. */
export type RetestQuestion = GeneratedQuestion;

/**
 * One opening page of the book, keyed by its PDF page index (0-based).
 *
 * The index labels each block in the prompt so the model can talk about "the
 * third page" if it must; the transcription itself carries no coordinates —
 * the printed numbers at the ends of the contents lines are the only pages
 * that matter, and the client measures where they land.
 */
export type ContentsPage = { index: number; text: string };

/**
 * The model's verbatim transcript of the contents — one entry per line, in
 * book order, exactly as printed — or the reason there is none.
 *
 * The model no longer generates a structure. It never sees the pages the
 * contents point at, so every coordinate it invented was refused by the
 * client for being incoherent; copying the lines in front of it is the one
 * thing it does reliably, and parsing those lines is code the client already
 * trusts.
 */
export type ContentsParse = {
  /** Transcript text, or "" when the model found nothing to transcribe. */
  text: string;
  /** Why no transcript arrived, when the model was never reached or not
   *  asked at all. Distinct from a genuine "no contents in these pages". */
  refused?: string;
};

/** The book's title, read off the cover and title page, or the reason none
 *  came back. Best-effort like every reader: a busy minute or a bad page is
 *  "no title", never an error the import screen has to explain. */
export type TitleParse = {
  title?: string;
  /** Why the model was never reached or not asked. */
  refused?: string;
};

export type AiService = {
  /**
   * Read a chapter once: its concept checklist AND the learning objectives the
   * book states for it. One call, not two — the Gemini free tier is per
   * project, so a second pass over the same text would double the cost of the
   * most quota-sensitive path in the app for no new information.
   *
   * Objectives are absent, not fabricated, when the book states none: the
   * combined prompt is told to return an empty list rather than invent them.
   */
  extractChapter(rawText: string): Promise<ChapterExtraction>;
  gradeRecall(
    transcript: string,
    concepts: ConceptChecklistItem[],
    subject?: string,
  ): Promise<GapAnalysis>;
  generateMicroLesson(
    gaps: GapAnalysis,
    concepts: ConceptChecklistItem[],
    language?: ContentLanguage,
    options?: { skipAi?: boolean; timeoutMs?: number; subject?: string },
  ): Promise<MicroLesson>;
  /**
   * One "why this step is yours" line per plan step, in ONE provider call —
   * the whole plan priced as a single request. The line is orienting, not a
   * fact: the caller falls back to the deterministic diagnosis line for any
   * concept the model skips, so a partial reply still yields a usable plan.
   *
   * Keyed by `conceptText.trim().toLowerCase()`.
   */
  generatePlanWhyFirst(
    chapterText: string,
    requests: PlanWhyRequest[],
    language?: ContentLanguage,
    options?: { skipAi?: boolean; timeoutMs?: number; subject?: string },
  ): Promise<Map<string, string>>;
  /**
   * Explain one concept. Student-independent by construction — it is not given
   * any gap or mastery data, because if it were it could not be shared.
   */
  generateGuideSection(
    conceptText: string,
    chapterText: string,
    language?: ContentLanguage,
    options?: { skipAi?: boolean; subject?: string },
  ): Promise<GuideSection>;
  /**
   * Diagnostic questions for *targeted* recall: short, low-pressure checks that
   * expose gaps and wrong beliefs — mostly multiple choice and fill-in-the-blank
   * so the student answers by tapping or typing, with the wrong options doing the
   * diagnosing. Deliberately a different, gentler pattern from the retest.
   */
  generateRecallQuestions(
    gaps: GapAnalysis,
    concepts: ConceptChecklistItem[],
    objectives: string[],
    language?: ContentLanguage,
    options?: {
      skipAi?: boolean;
      timeoutMs?: number;
      subject?: string;
      /** The chapter's raw text, used only by the deterministic fallback to
       *  ground closed questions in the book's own sentences. */
      chapterText?: string;
    },
  ): Promise<GeneratedQuestion[]>;
  /**
   * Exam-readiness questions: standardized across the five cognitive levels,
   * never easy, carrying fine detail and at least one beyond-the-textbook
   * critical-thinking scenario. Aimed at the failed objectives, failed
   * concepts, and the lowest mastery levels. Not a diagnostic and not the same
   * shape as a recall question.
   */
  generateRetestQuestions(
    gaps: GapAnalysis,
    concepts: ConceptChecklistItem[],
    objectives: string[],
    language?: ContentLanguage,
    options?: { skipAi?: boolean; timeoutMs?: number; subject?: string },
  ): Promise<GeneratedQuestion[]>;
  /**
   * Read a textbook's table of contents out of its opening pages.
   *
   * Deliberately has no deterministic fallback of its own: when there is
   * nothing to read, `found` comes back false and the caller falls back to the
   * heading scan, which is the same answer the client would have reached on its
   * own. Returning that honestly is better than synthesising a contents.
   */
  parseContents(pages: ContentsPage[]): Promise<ContentsParse>;
  /**
   * Read a table of contents from a *rendering* of its page.
   *
   * The last rung of the ladder, for the book whose page text will not come
   * out at all: the client draws the contents page to an image on the device
   * and sends it here. Gemini-only — the text-only provider cannot see it —
   * so an image read is refused, not degraded, when that key is absent.
   */
  parseImageContents(image: ContentsImage): Promise<ContentsParse>;
  /**
   * Name a textbook from its first pages. The companion to [parseContents]:
   * a cover leads with Government of Ethiopia banner text and the title page
   * lists writers and editors, so the one line that names the book needs an
   * eye that can tell "Biology Grade 10" from "Ministry of Education".
   */
  parseTitle(pages: ContentsPage[]): Promise<TitleParse>;
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
  // Concepts the client never mentioned are not gaps to explain, so they are left
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

/**
 * A provider counts as wired up when a real key is present. Both schema files
 * ship a "placeholder-…" default so production builds pass without secrets,
 * and a placeholder must read as "not configured" — otherwise a deployment
 * that never got its key would silently bet every request on a provider that
 * does not exist.
 */
function configured(key: string | undefined): boolean {
  return (
    typeof key === "string" &&
    key.trim().length > 0 &&
    !key.trim().startsWith("placeholder-")
  );
}

function isAiAvailable(): boolean {
  return configured(env.GEMINI_API_KEY);
}

function isGroqAvailable(): boolean {
  return configured(env.GROQ_API_KEY);
}

/** The seam produces a real answer when ANY provider is wired up; the ladder
 *  inside `ask` decides which one actually takes the call. */
function anyAiAvailable(): boolean {
  return isAiAvailable() || isGroqAvailable();
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

function withRecallEvidence(
  gaps: GapAnalysis,
  transcript: string,
  concepts: ConceptChecklistItem[],
): GapAnalysis {
  const evidence: Record<string, string | null> = {};
  for (const concept of concepts) {
    const level = levelOf(gaps.mastery, concept.conceptText);
    if (level !== 1 && level !== 2) continue;
    const wanted = significantTokens(concept.conceptText);
    let best: { text: string; score: number } | undefined;
    for (const match of transcript.matchAll(/[^.!?]+[.!?]*/g)) {
      const text = match[0].trim();
      const tokens = significantTokens(text);
      const score = [...wanted].filter((token) => tokens.has(token)).length;
      if (score && (!best || score > best.score)) best = { text, score };
    }
    evidence[concept.conceptText] = best?.text ?? null;
  }
  return { ...gaps, evidence };
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

/**
 * The deterministic questions, when no model answers. Retest cannot judge a
 * novel scenario, so it does not pretend to: each retest question asks the
 * student to explain a named idea, and the level is assigned by the shared
 * ladder so the set still spreads. Recall is better served: the chapter's own
 * sentences let it build the same closed mix the writer aims for — a term blanked
 * out of a sentence it appears in, with other chapter concepts as the wrong
 * options — so an offline student still gets tap-and-type questions, not a wall
 * of spoken essays.
 */
function fallbackQuestions(
  gaps: GapAnalysis,
  kind: QuestionKind,
  language: ContentLanguage = "en",
  recall: {
    concepts?: ConceptChecklistItem[];
    chapterText?: string;
    family?: SubjectFamily;
  } = {},
): GeneratedQuestion[] {
  const targets = [...gaps.missing, ...gaps.misconceptions].slice(
    0,
    kind === "retest" ? 5 : RECALL_SET_SIZE,
  );
  const levels = fallbackLevels(kind, targets.length);
  if (kind === "retest") {
    return targets.map((t, i) => ({
      question:
        language === "am"
          ? `“${t}”ን በጥልቀት አብራራ፣ ግን በአንተ ቃላት።`
          : `Explain “${t}” in full and precise detail, using your own words.`,
      level: levels[i] ?? "comprehension",
      targetConcept: t,
    }));
  }
  const sentences = recall.chapterText ? sentencesOf(recall.chapterText) : [];
  const names = (recall.concepts ?? []).map((c) => c.conceptText);
  const plan = recallFormatPlan(targets.length, recall.family ?? "other");
  return targets.map((t, i) =>
    fallbackRecallQuestion(
      t,
      sentences,
      names,
      plan[i] ?? "short_answer",
      levels[i] ?? "knowledge",
      language,
    ),
  );
}

/** Sentences of a chapter, whitespace-flattened and length-bounded, so the
 *  deterministic recall builder has clean stems to work from. */
function sentencesOf(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20 && s.length <= 320);
}

/** The first chapter sentence that names this concept, or null — the honest
 *  gate on whether a closed fallback question can be grounded in the book. */
function sentenceFor(concept: string, sentences: string[]): string | null {
  const needle = concept.trim().toLowerCase();
  if (!needle) return null;
  return sentences.find((s) => s.toLowerCase().includes(needle)) ?? null;
}

/** Replace the concept's occurrence with a blank, keeping the sentence intact. */
function blankOut(sentence: string, concept: string): string {
  const needle = concept.trim();
  const idx = sentence.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return sentence;
  return `${sentence.slice(0, idx)}____${sentence.slice(idx + needle.length)}`;
}

/** Deterministic wrong options: other concept names from the same chapter, so
 *  they are plausible to a student who does not yet know the term. */
function distractorNames(
  correct: string,
  names: string[],
  count: number,
): string[] {
  const seen = new Set([correct.trim().toLowerCase()]);
  const out: string[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= count) break;
  }
  return out;
}

/** Place the correct option at a deterministic position so it is not always
 *  first — a fixed "A is right" pattern is its own giveaway. */
function orderedOptions(correct: string, distractors: string[]): string[] {
  const options = [correct, ...distractors];
  if (options.length <= 1) return options;
  const offset = correct.trim().length % options.length;
  return [...options.slice(offset), ...options.slice(0, offset)];
}

/** One deterministic recall question: multiple choice or fill-in-the-blank when
 *  the chapter text grounds it, and a spoken short answer when it does not. */
function fallbackRecallQuestion(
  target: string,
  sentences: string[],
  names: string[],
  format: RecallFormat,
  level: CognitiveLevel,
  language: ContentLanguage,
): GeneratedQuestion {
  const am = language === "am";
  const sentence = sentenceFor(target, sentences);
  const stem = sentence ? blankOut(sentence, target) : null;
  if (format === "multiple_choice" && stem) {
    const distractors = distractorNames(target, names, 3);
    if (distractors.length >= 2) {
      return {
        question: am
          ? `ከምዕራፉ የተወሰደውን ክፍተት የሚሞላው የትኛው ነው? “${stem}”`
          : `Which term fills the blank in this sentence from the chapter? “${stem}”`,
        level,
        targetConcept: target,
        format: "multiple_choice",
        options: orderedOptions(target, distractors.slice(0, 3)),
        answer: target,
      };
    }
  }
  if (format === "fill_blank" && stem) {
    return {
      question: am ? `ክፍተቱን ሙላ፦ “${stem}”` : `Fill in the blank: “${stem}”`,
      level,
      targetConcept: target,
      format: "fill_blank",
      answer: target,
    };
  }
  return {
    question: am
      ? `“${target}”ን በራስህ ቃላት ገልጽ — ጓደኛ እንደሆነ።`
      : `Explain “${target}” in your own words, as if explaining it to a friend.`,
    level,
    targetConcept: target,
    format: "short_answer",
  };
}

/**
 * The verb a plan step leads with. It names the move for the failure mode —
 * missing, half-remembered, or mixed up with a neighbour — so the roadmap
 * reads as an action the student takes, not a question they answer.
 */
export function planAction(
  level: MasteryLevel,
  language: ContentLanguage,
): string {
  const am = language === "am";
  if (level === 2) return am ? "ልዩ አድርጋቸው" : "Tell them apart";
  if (level === 1) return am ? "አጠናቅቀው" : "Complete it";
  return am ? "ተማረው" : "Learn it";
}

/** The subject-shaped suffix on a search query, so "what to search" reflects
 *  the kind of thinking this subject needs — an ordered process, a cause and
 *  its consequence, a place and its reason, a rule applied to a case. */
export function searchSuffix(
  archetype: PlanArchetype,
  language: ContentLanguage,
): string {
  const am = language === "am";
  const map: Record<PlanArchetype, string> = {
    PROCESS: am ? "ደረጃዎች በማብራሪያ" : "steps explained",
    CAUSAL: am ? "መንስኤና ውጤት" : "causes and effects",
    PLACE_SYSTEM: am ? "ማብራሪያ" : "explained",
    PRINCIPLE: am ? "ደንብና ምሳሌ" : "rule and example",
    LANGUAGE: am ? "ትርጉምና አጠቃቀም" : "meaning and usage",
    GENERIC: am ? "ማብራሪያ" : "explained",
  };
  return map[archetype];
}

/**
 * A ready-made search query for one step: the concept, the subject, and a
 * subject-shaped suffix. Deterministic and free — the student still chooses
 * what to open, which is exactly why no URL is ever invented here.
 */
export function searchQueryFor(
  concept: string,
  subject: string,
  archetype: PlanArchetype,
  language: ContentLanguage,
): string {
  const term = concept.trim().replace(/[.?!,;:]+$/, "");
  const parts = [term];
  const named = subject.trim();
  if (named && !term.toLowerCase().includes(named.toLowerCase()))
    parts.push(named);
  parts.push(searchSuffix(archetype, language));
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * The deterministic "why this step is yours" line — used when the model
 * cannot write one and as the honest baseline. It states the diagnosis, never
 * a fact about the subject.
 */
export function planWhyFirst(
  level: MasteryLevel,
  studentWords: string | null,
  language: ContentLanguage,
): string {
  const am = language === "am";
  if (level === 2) {
    return studentWords
      ? am
        ? `“${studentWords}” አልክ — ጽሑፉ ግን በተለየ መንገድ ይላል።`
        : `You said “${studentWords}” — the chapter says it differently.`
      : am
        ? "ተመሳሳይ ሃሳቦችን ቀላቅለሃል።"
        : "You mixed this up with a similar idea.";
  }
  if (level === 1) {
    return am
      ? "ጠቀስከው፣ ግን ሙሉ በሙሉ አልሆነም።"
      : "You mentioned this, but not fully.";
  }
  return am ? "በማስታወስህ አልነበረም — እዚህ ጀምር።" : "Not in your recall — start here.";
}

export function estimateStudyStepMinutes(excerpt: string): number {
  const words = excerpt.trim().split(/\s+/).filter(Boolean).length;
  // Reading the passage, plus a fixed allowance for the search-and-watch the
  // step actually asks for. Clamped so a long excerpt cannot dominate a plan.
  const minutes = 3 + words / READING_WORDS_PER_MINUTE;
  return Math.min(8, Math.max(3, Math.round(minutes)));
}

/** Pure reading time for a passage — no search/watch allowance, at least a
 *  minute. Used to price the time a student saves by skipping what they know. */
export function readingMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / READING_WORDS_PER_MINUTE));
}

export function getSubjectContext(
  subject: string,
  conceptText = "",
): SubjectFamilyContext {
  const normalized = (subject || "").trim().toLowerCase();
  let archetype: PlanArchetype = "GENERIC";
  const family = getFamily(subject);
  if (normalized.includes("civics")) archetype = "PRINCIPLE";
  else if (family === "biology") archetype = "PROCESS";
  else if (family === "chemistry") {
    if (
      /(stoichiometr|moles?|equations?|concentration|calculat|formulae?|chemical formula)/i.test(
        conceptText,
      )
    )
      archetype = "GENERIC";
    else archetype = "PROCESS";
  } else if (family === "history_social") archetype = "CAUSAL";
  else if (family === "geography") archetype = "PLACE_SYSTEM";
  else if (family === "economics_business") archetype = "PRINCIPLE";
  else if (family === "english_languages") archetype = "LANGUAGE";
  else if (family === "physics") archetype = "GENERIC";
  else if (family === "cs_ict") archetype = "GENERIC";
  else if (family === "mathematics") archetype = "GENERIC";
  else if (family === "general_science") archetype = "GENERIC";
  else {
    if (normalized === "history") archetype = "CAUSAL";
    if (normalized === "geography") archetype = "PLACE_SYSTEM";
    if (normalized.includes("civics")) archetype = "PRINCIPLE";
    if (
      normalized === "english" ||
      normalized.includes("language") ||
      normalized.includes("mother tongue")
    )
      archetype = "LANGUAGE";
    if (normalized === "biology") archetype = "PROCESS";
    if (normalized === "chemistry") archetype = "PROCESS";
  }
  return { subject, family, archetype };
}

export function planArchetype(
  subject: string,
  conceptText = "",
): PlanArchetype {
  return getSubjectContext(subject, conceptText).archetype;
}

export function buildStudyPlan(
  gaps: GapAnalysis,
  concepts: ConceptChecklistItem[],
  chapterTitle: string,
  rawText: string,
  whyFirstByConcept: Map<string, string>,
  subject: string,
  language: ContentLanguage,
  budgetMinutes = STUDY_PLAN_DEFAULT_BUDGET,
): StudyPlan {
  const mastery = gaps.mastery;
  const allCandidates = concepts
    .map((concept, index) => {
      const level = levelOf(mastery, concept.conceptText);
      const anchor = sourceAnchor(concept.conceptText, rawText);
      if (concept.isMisconception || level === 3 || !anchor) return null;
      const key = concept.conceptText.trim().toLowerCase();
      const archetype = planArchetype(subject, concept.conceptText);
      const studentWords =
        level === 1 || level === 2
          ? (gaps.evidence?.[concept.conceptText] ?? null)
          : null;
      const minutes = estimateStudyStepMinutes(anchor.quote);
      const modelWhy = whyFirstByConcept.get(key)?.trim();
      return {
        concept,
        index,
        level,
        anchor,
        key,
        studentWords,
        whyFirst: modelWhy || planWhyFirst(level, studentWords, language),
        action: planAction(level, language),
        searchQuery: searchQueryFor(
          concept.conceptText,
          subject,
          archetype,
          language,
        ),
        minutes,
        score:
          (concept.weight * (3 - level) * (level === 2 ? 1.5 : 1)) / minutes,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const prioritized = [...allCandidates].sort(
    (a, b) => b.score - a.score || a.index - b.index,
  );
  const selected = new Set<string>();
  let elapsed = 0;
  for (const candidate of prioritized) {
    if (
      selected.size >= STUDY_PLAN_MAX_STEPS ||
      elapsed + candidate.minutes > budgetMinutes
    )
      continue;
    selected.add(candidate.key);
    elapsed += candidate.minutes;
  }
  const candidateByConcept = new Map(
    allCandidates.map((candidate) => [
      candidate.concept.conceptText,
      candidate,
    ]),
  );
  const ordered = triageConcepts(concepts, mastery, { studyPlan: true })
    .map((concept) => candidateByConcept.get(concept.conceptText))
    .filter(
      (candidate): candidate is (typeof allCandidates)[number] =>
        candidate !== undefined && selected.has(candidate.key),
    );

  const steps: StudyPlanStep[] = ordered.map((item) => ({
    concept: item.concept.conceptText,
    gapType: item.level === 2 ? "misconception" : "missing",
    weight: item.concept.weight,
    masteryLevel: item.level,
    estimatedMinutes: item.minutes,
    anchor: {
      chapter: chapterTitle,
      heading: null,
      page: null,
      offset: item.anchor.offset,
      excerpt: item.anchor.quote,
    },
    whyFirst: item.whyFirst,
    action: item.action,
    searchQuery: item.searchQuery,
    studentWords: item.studentWords,
  }));
  const knownConcepts = concepts.filter(
    (concept) =>
      !concept.isMisconception && levelOf(mastery, concept.conceptText) === 3,
  );
  // Time saved is the reading the student avoids by skipping the ideas they
  // already know — not "whole chapter minus the plan", which fell as the budget
  // grew (a bigger plan meant *less* time saved), the opposite of what the line
  // promises. Priced from each known concept's own excerpt, so it tracks the
  // diagnosis and is independent of the budget.
  const savedMinutes = knownConcepts.reduce((total, concept) => {
    const anchor = sourceAnchor(concept.conceptText, rawText);
    return total + (anchor ? readingMinutes(anchor.quote) : 0);
  }, 0);
  const planMinutes = steps.reduce(
    (total, step) => total + step.estimatedMinutes,
    0,
  );
  return {
    steps,
    nextSession: concepts
      .filter(
        (concept) =>
          !concept.isMisconception &&
          levelOf(mastery, concept.conceptText) !== 3 &&
          !selected.has(concept.conceptText.trim().toLowerCase()),
      )
      .map((concept) => concept.conceptText),
    skippedKnown: {
      count: knownConcepts.length,
      estimatedTimeSavedMinutes: savedMinutes,
    },
    budgetMinutes,
    estMinutes: planMinutes,
    estimated: ordered.some((item) => !whyFirstByConcept.get(item.key)),
  };
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
 * The deterministic path cannot translate and cannot explain, so it does not
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
        : `Explain “${conceptText}” in your own words, as if explaining it to a friend.`,
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
 * The guide's default order is misconceptions, near-misses, untouched concepts
 * by importance, then solid concepts. Study plans use the same mastery map but
 * place FINISH steps after BUILD steps. A misconception checklist item is a
 * wrong belief, not a concept, so it never gets a section of its own.
 */
export function triageConcepts(
  concepts: ConceptChecklistItem[],
  mastery: MasteryMap,
  options: { studyPlan?: boolean } = {},
): ConceptChecklistItem[] {
  const rank = (c: ConceptChecklistItem) => levelOf(mastery, c.conceptText);
  return concepts
    .filter((c) => !c.isMisconception)
    .map((concept, i) => ({ concept, i }))
    .sort((a, b) => {
      // The plan keeps the shared mastery triage but moves FINISH rounds after
      // BUILD steps. The guide's established order remains unchanged.
      const tier = (level: MasteryLevel) => {
        if (options.studyPlan) {
          if (level === 2) return 0;
          if (level === 0) return 1;
          if (level === 1) return 2;
          return 3;
        }
        if (level === 2) return 0;
        if (level === 1) return 1;
        if (level === 0) return 2;
        return 3;
      };
      const byTier = tier(rank(a.concept)) - tier(rank(b.concept));
      if (byTier !== 0) return byTier;
      // The existing guide weights within a tier. Plan order follows the book.
      if (!options.studyPlan && b.concept.weight !== a.concept.weight)
        return b.concept.weight - a.concept.weight;
      // Ties keep checklist order so both guide and plan output are stable.
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

// A stalled provider call must never hang a student session: after this the
// promise rejects, the per-method catch falls back, and the UI keeps moving.
const PROVIDER_TIMEOUT_MS = 20_000;

// The whole ladder — both providers, every model — shares ONE wall-clock budget
// rather than getting a fresh full timeout each. Six 20s attempts would be 120s
// of hanging, which blows past the 30s client fetch timeout in `api.ts` and
// turns a transient blip into a hard error page. Each attempt gets whatever is
// left of the budget, so the retry path stays inside the client window (24s of
// calls + backoff vs 30s) with a little headroom. Raise AI_TOTAL_BUDGET_MS only
// if that client timeout moves.
const AI_TOTAL_BUDGET_MS = 24_000;
// The attempt list length, kept next to the budget comment because the two are
// one decision: the budget bounds the wall clock, this bounds how many models
// or retries we can try inside it. A 503 on one model is answered by the next
// rather than by waiting.
const GEMINI_MAX_ATTEMPTS = MODEL_FALLBACKS.length + 1;

// A request-level rejection (4xx, except 429) will fail on every provider the
// same way, so retrying it across the ladder only burns quota we have per
// project, not per user. Every other failure — 429, 5xx, or a status-less
// timeout/network error — moves to the next model or provider instead.
const RETRY_BASE_DELAY_MS = 500;

/** The Gemini SDK surfaces the HTTP status on `ApiError.status`; be defensive
 *  because a timeout rejection from `withTimeout` is a plain `Error`. */
function statusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

/**
 * The provider declining a request *we* got wrong, as opposed to failing us.
 *
 * 400/401/403/404/422 mean our request was unacceptable — a malformed prompt,
 * a bad image, an oversized payload. Retrying is pointless and, worse, counting
 * it against the global breaker takes AI away from every other student because
 * one chapter's prompt was malformed. 429 is deliberately excluded: that one is
 * the provider under load, which is exactly what the breaker exists to see.
 */
function isCallerError(status: number): boolean {
  return status >= 400 && status < 500 && status !== 429;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`AI request timed out after ${ms}ms`));
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
// the failure to expect on EITHER provider's free tier — per *project*, not per
// user (~10 req/min and ~1-1.5k/day on Gemini, ~30 req/min on Groq) — and we
// are explicitly not paying until real users prove the case, so our own
// per-provider allowance is deliberately set below the ceiling. The second
// provider exists to make "the quota ran out" a different, survivable day.
const aiTelemetry = {
  /** Which provider last answered, or "" if none has. */
  lastProvider: "",
  /** Which model last answered, or "" if none has. Read at 2am to answer
   *  "is this the model, or is it us?" without adding a log line per call. */
  lastModel: "",
  attempts: 0,
  retries: 0,
  rateLimited: 0,
  timeouts: 0,
  malformed: 0,
  failed: 0,
  /** Retest sets that came back too soft (fewer than 3 levels, or no
   *  beyond-textbook question) — a quality signal, not a failure. */
  softRetest: 0,
};

export function aiTelemetrySnapshot() {
  // The admission nested here is the PRIMARY provider's, because the counts
  // that want comparing against `lastProvider` live in this object; the other
  // provider's full state rides along via /ai/telemetry's `providers` field.
  return { ...aiTelemetry, admission: admissionSnapshot() };
}

/**
 * Interleave the model list so a busy model is answered by another one rather
 * than by waiting.
 *
 * Probing found 3.6 returning 503 "high demand" while 2.5 answered every
 * prompt, so a student asking during a 3.6 outage should still get a written
 * section instead of the deterministic fallback. The first model leads and
 * gets a second turn, because it is the one measured working: a transient blip
 * on it is worth retrying before trying anything else.
 *
 * Exported for tests — the order is a claim about reliability, so it is
 * asserted rather than assumed.
 */
export function buildAttemptOrder(
  models: readonly string[],
  attempts: number,
): string[] {
  if (attempts <= 0) return [];
  const [leader, ...alternates] = models;
  if (!leader) return [];
  // Leader first, then each alternate in order, then over again. So attempt 2
  // is a different model (a busy leader is answered by another one, not by
  // waiting), and the leader returns on attempt N+1 rather than being written
  // off, so a single transient blip still gets the model we measured working.
  const order: string[] = [];
  while (order.length < attempts) {
    order.push(leader, ...alternates);
  }
  return order.slice(0, attempts);
}

/**
 * Flatten the configured providers into one attempt list, in ladder order.
 *
 * Gemini leads — it is the provider measured working — with its model ladder
 * first; Groq follows at its own attempt count. A provider that is not wired
 * up contributes nothing, in the same way a model that is not listed does.
 *
 * Exported for tests: the ordering is a claim about reliability and capacity,
 * so it is asserted rather than assumed.
 */
export function buildProviderAttempts(
  gemini: boolean,
  groq: boolean,
  vision = false,
): Array<{ provider: AiProvider; model: string }> {
  const attempts: Array<{ provider: AiProvider; model: string }> = [];
  if (gemini)
    for (const model of buildAttemptOrder(MODEL_FALLBACKS, GEMINI_MAX_ATTEMPTS))
      attempts.push({ provider: "gemini", model });
  // Groq's only models are text-only, so a vision call must not consider it —
  // admitting the attempt would spend a request to receive a prompt the model
  // cannot see.
  if (groq && !vision)
    for (const model of buildAttemptOrder(GROQ_MODELS, GROQ_MAX_ATTEMPTS))
      attempts.push({ provider: "groq", model });
  return attempts;
}

/**
 * One logical attempt inside the ladder. The two real implementations below
 * (geminiGenerate / groqGenerate) are dispatchable so the fallover itself can
 * be tested without a real key or a real provider — see
 * __overrideProviderForTests.
 */
/** A page image to read directly. Vision is Gemini-only: Groq's models are
 *  text-only, so a vision call never considers it. */
export type ContentsImage = { mimeType: string; dataBase64: string };

type AiCallOptions = {
  /** A JSON Schema describing the reply, enforced by the provider. */
  schema?: Record<string, unknown>;
  /** Ask for plain text — a transcription — instead of JSON. */
  text?: boolean;
  /** Read this page image alongside the prompt. */
  image?: ContentsImage;
};

type ProviderGenerate = (
  model: string,
  systemPrompt: string,
  userInput: string,
  options: AiCallOptions,
) => Promise<string>;

// Function declarations are hoisted, so these may reference functions defined
// further down the file; at module load every entry is the real provider.
const defaultProviderCallbacks: Record<AiProvider, ProviderGenerate> = {
  gemini: geminiGenerate,
  groq: groqGenerate,
};
const providerCallbacks: Record<AiProvider, ProviderGenerate> = {
  ...defaultProviderCallbacks,
};

/**
 * Test seam, in the style of admission's __resetAdmissionForTests: swap a
 * provider's callback without so much as a placeholder key. `null` restores
 * the real implementation.
 */
export function __overrideProviderForTests(
  provider: AiProvider,
  fn: ProviderGenerate | null,
): void {
  providerCallbacks[provider] = fn ?? defaultProviderCallbacks[provider];
}

async function ask(
  systemPrompt: string,
  userInput: string,
  options: AiCallOptions & {
    /** Per-operation cap, still bounded by the shared AI retry budget. */
    timeoutMs?: number;
  } = {},
): Promise<string> {
  const deadline =
    Date.now() +
    Math.min(AI_TOTAL_BUDGET_MS, options.timeoutMs ?? AI_TOTAL_BUDGET_MS);
  let lastError: unknown;
  // A provider refusing its own admission is NOT an error to the student — it
  // is a reason to hand the call to the next provider. The last refusal is kept
  // so that, if every provider refuses, the honest "busy" answer reaches the
  // route instead of a misleading "AI degraded" fallback.
  let lastBusy: unknown;

  const attempts = buildProviderAttempts(
    isAiAvailable(),
    isGroqAvailable(),
    Boolean(options.image),
  );
  // Unreachable in practice — every caller guards on `anyAiAvailable` before
  // calling `ask` — but the ladder must not silently accept an empty order.
  if (attempts.length === 0) throw new Error("No AI provider configured");

  for (const [index, { provider, model }] of attempts.entries()) {
    const remaining = deadline - Date.now();
    // Out of wall clock: a timeout, not a provider fault. Fall back rather
    // than starting an attempt that cannot finish inside the client window.
    if (remaining <= 0) {
      lastError = new Error("AI retry budget exhausted");
      break;
    }

    // Admission is per attempt so the allowance tracks the provider that is
    // actually asked: a request that Gemini sheds is still worth serving, and
    // only an admitted call settles against its gate.
    let admission: Awaited<ReturnType<typeof admitAiCall>>;
    try {
      admission = await admitAiCall(provider, remaining);
    } catch (error) {
      if (isAiBusy(error)) {
        lastBusy = error;
        // A shed costs no token and no network, so the remaining attempts of
        // this provider shed just as cheaply on their turn instead of being
        // skipped explicitly — the loop lands on the next provider naturally.
        continue;
      }
      throw error;
    }
    // Counted here, not before admission: `attempts` means *provider calls
    // actually made*, so "sheds > 0 with attempts flat" still reads as "we
    // refused on purpose" at 2am rather than as work that never happened.
    aiTelemetry.attempts += 1;

    try {
      let response: string;
      try {
        response = await withTimeout(
          providerCallbacks[provider](model, systemPrompt, userInput, options),
          Math.min(PROVIDER_TIMEOUT_MS, remaining),
        );
      } catch (error) {
        // A structured-output schema the provider rejects is a request-level
        // fault — but the schema is an optimisation, not the task itself. Retry
        // this same provider once without it, so a picky schema degrades to the
        // prompt's own "STRICT JSON" instruction instead of losing the call.
        const failedSchema = statusOf(error);
        if (
          !options.schema ||
          failedSchema === undefined ||
          !isCallerError(failedSchema)
        ) {
          throw error;
        }
        aiTelemetry.retries += 1;
        response = await withTimeout(
          providerCallbacks[provider](model, systemPrompt, userInput, {
            ...options,
            schema: undefined,
          }),
          Math.min(PROVIDER_TIMEOUT_MS, remaining),
        );
      }
      aiTelemetry.lastProvider = provider;
      aiTelemetry.lastModel = model;
      admission.settle("success");
      return response;
    } catch (error) {
      lastError = error;
      // Classify immediately rather than at the bottom: a 4xx is the provider
      // declining a request we sent badly, and it must not be allowed to reach
      // that provider's breaker. 429 is the exception — that one genuinely is
      // the provider under load, and it is the failure mode this module exists
      // for.
      admission.settle(
        statusOf(error) !== undefined &&
          isCallerError(statusOf(error) as number)
          ? "caller-error"
          : "provider-failure",
      );

      // Only a request-level rejection ends the ladder: a 4xx means we sent
      // something unacceptable, and the next provider would decline the same
      // prompt. Everything else — 429, 5xx, a status-less timeout or network
      // error — hands the request to the next model or provider, because Groq
      // may be healthy at the very moment Gemini is not.
      const failedStatus = statusOf(error);
      if (failedStatus !== undefined && isCallerError(failedStatus)) break;
      // Every model of every provider tried and failed within the budget.
      if (index === attempts.length - 1) break;

      aiTelemetry.retries += 1;
      // Jitter matters here: many students hit the same per-project ceiling at
      // the same moment, and fixed backoff would have them all retry in
      // lockstep and re-trip the 429 immediately.
      //
      // No delay when the NEXT attempt uses a DIFFERENT model: a busy model is
      // not a rate limit on us, so backing off would waste wall clock we do not
      // have. Back off only when we are retrying the same model.
      const sameModel = attempts[index + 1]?.model === model;
      const delay = sameModel
        ? RETRY_BASE_DELAY_MS * 2 ** index + Math.random() * 250
        : 0;
      if (delay)
        await sleep(Math.min(delay, Math.max(0, deadline - Date.now())));
    }
  }

  // Every provider refused without a single attempt reaching them: that is the
  // honest "busy, try again in N seconds", and it must NOT become the
  // deterministic fallback (degraded() re-throws AiBusyError for the same
  // reason). `lastError` is set on the "budget exhausted" break above, so only
  // rethrow the refusal when no provider was even reached.
  if (isAiBusy(lastBusy) && lastError === undefined) throw lastBusy;

  const status = statusOf(lastError);
  if (status === 429) aiTelemetry.rateLimited += 1;
  else if (
    lastError instanceof Error &&
    lastError.message.includes("timed out")
  )
    aiTelemetry.timeouts += 1;
  throw lastError instanceof Error ? lastError : new Error("AI request failed");
}

/** One Gemini attempt: the SDK call stripped out of the ladder so another
 *  provider can sit beside it. */
async function geminiGenerate(
  model: string,
  systemPrompt: string,
  userInput: string,
  options: AiCallOptions,
): Promise<string> {
  const response = await genAI.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          { text: `${systemPrompt}\n\n---\n${userInput}` },
          ...(options.image
            ? [
                {
                  inlineData: {
                    mimeType: options.image.mimeType,
                    data: options.image.dataBase64,
                  },
                },
              ]
            : []),
        ],
      },
    ],
    config: options.schema
      ? {
          responseMimeType: "application/json",
          temperature: 0.4,
          // `responseJsonSchema` takes a plain JSON Schema object and is
          // the form the SDK recommends when `response_schema` is being
          // picky. Enforcing the shape at the provider keeps a graded
          // answer from degrading into "valid JSON, wrong structure" —
          // the only failure this path cannot recover from cheaply.
          responseJsonSchema: options.schema,
        }
      : {
          // Transcription: the model copies what it sees, so the reply
          // is plain text and the temperature is low — there is nothing
          // to invent and a paraphrase would only be harder to parse.
          responseMimeType: options.text ? "text/plain" : "application/json",
          temperature: options.text ? 0.2 : 0.4,
        },
  });
  return response.text ?? "";
}

/**
 * One Groq attempt. A provider with a different contract, so instead of an SDK
 * it is one POST to the OpenAI-compatible endpoint — the exact request shape
 * Groq documents, with the same low temperature philosophy on transcriptions.
 *
 * JSON mode is used for every non-transcription call because every one of those
 * prompts already demands "STRICT JSON", which is also what Groq's
 * `json_object` mode requires; `text` calls skip it so a transcription is never
 * wrapped in JSON the parser would have to fish out.
 */
async function groqGenerate(
  model: string,
  systemPrompt: string,
  userInput: string,
  options: AiCallOptions,
): Promise<string> {
  // Groq has no vision models. `buildProviderAttempts` never routes an image
  // here, so reaching this with one means the ladder was bypassed; failing
  // loudly beats sending a blind prompt and returning a confident fiction.
  if (options.image) throw new Error("Groq does not support image input");
  const wantsJson = !options.text;
  const response = await fetch(GROQ_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userInput },
      ],
      temperature: options.text ? 0.2 : 0.4,
      max_tokens: wantsJson ? 4096 : 16_384,
      ...(wantsJson ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // An empty or non-JSON body is still a failure worth reporting below.
  }

  if (!response.ok) {
    const message = (data as { error?: { message?: string } } | null)?.error
      ?.message;
    // Attach the HTTP status exactly like the Gemini SDK's `ApiError` does, so
    // `statusOf`/`isCallerError` classify Groq failures with no
    // provider-specific branches.
    const err = new Error(
      message ?? `Groq request failed (${response.status})`,
    ) as Error & {
      status: number;
    };
    err.status = response.status;
    throw err;
  }

  const content = (
    data as {
      choices?: Array<{ message?: { content?: string } }>;
    } | null
  )?.choices?.[0]?.message?.content;
  return content ?? "";
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

/** The most objectives a single chapter may carry, matching the DB-facing cap
 *  used by the deterministic extractor. */
const MAX_OBJECTIVES = 15;

/**
 * Read the `objectives` array out of an extraction reply and anchor each one.
 *
 * Objectives are optional — a chapter that states none returns an empty list,
 * which is a valid answer, not a malformed one. So this never returns null:
 * anything unusable collapses to "no objectives", the honest reading of a book
 * that simply did not list them. The anchor is computed from the chapter text,
 * never taken from the model, for the same reason guide anchors are.
 */
function extractObjectiveItems(
  raw: string,
  chapterText: string,
): ObjectiveItem[] {
  const data = parseJson<{ objectives?: unknown[] }>(raw);
  if (!data || !Array.isArray(data.objectives)) return [];
  const out: ObjectiveItem[] = [];
  const seen = new Set<string>();
  for (const entry of data.objectives) {
    const text =
      typeof entry === "string"
        ? entry
        : typeof entry === "object" &&
            entry !== null &&
            typeof (entry as { objectiveText?: unknown }).objectiveText ===
              "string"
          ? (entry as { objectiveText: string }).objectiveText
          : "";
    const objectiveText = text.trim();
    if (!objectiveText) continue;
    const key = objectiveText.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const anchor = sourceAnchor(objectiveText, chapterText);
    out.push({
      objectiveText,
      sourceOffset: anchor?.offset,
      sourceQuote: anchor?.quote,
    });
    if (out.length >= MAX_OBJECTIVES) break;
  }
  return out;
}

/** The deterministic half of `extractChapter`: concepts from sentences, the
 *  book's stated objectives from its own objectives heading. */
function fallbackExtraction(rawText: string): ChapterExtraction {
  return {
    concepts: fallbackExtract(rawText),
    objectives: fallbackObjectives(rawText).map((o) => ({
      objectiveText: o.objectiveText,
      sourceOffset: o.offset,
    })),
    estimated: true,
  };
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
  "Extract the core concepts someone must understand to master this chapter, and transcribe the chapter's OWN stated learning objectives when it lists them. " +
  "Return STRICT JSON, no prose, in this exact shape: " +
  '{"items":[{"conceptText":"short self-contained phrase (5-15 words, as the student would say it)","weight":1-5,"isMisconception":false}],' +
  '"objectives":[{"objectiveText":"one objective, as the book states it, as an imperative such as Describe... / Explain... / Calculate..."}]}. ' +
  "Include common student MISCONCEPTIONS as separate items (isMisconception true, phrased as the WRONG belief). " +
  "Return 5-10 concept items, only what is actually in the text. " +
  "For objectives: copy ONLY the objectives the chapter itself states (under a heading like Objectives, Learning Outcomes, or Competencies). " +
  "Do not invent objectives, and do not turn concepts into objectives: if the chapter states none, return an empty objectives array. " +
  "Return at most 15 objectives.";

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

// Shared, student-independent guide content. Personalized study-plan steps use
// the separate, source-substring-validated generator above.
const SECTION_SYSTEM =
  "You explain ONE concept to a Grade 12 student revising this chapter. " +
  "Return STRICT JSON, no prose, no markdown: " +
  '{"what":"1-2 sentences stating the idea itself, in plain words","why":"1 sentence on why it matters or what it connects to","recall":"1 question asking the student to say it back in their own words"}. ' +
  "Rules that matter more than they look: " +
  "- Every sentence will be READ ALOUD by a voice engine, so write for the ear: short clauses, no headers, no bullets, no symbols, no parentheses. " +
  "- 'what' must stand alone. A student who reads only this line should be able to explain the concept to a friend. " +
  "- 'recall' must ask for an explanation, not a yes/no or multiple choice. " +
  "- Do not mention the student, their grade, their mistakes, or what they got wrong: this section is written ONCE and read by every student who opens this chapter, " +
  "including students who have no gap here at all. Explain the concept; do not coach a specific person. " +
  "- Do not invent facts, page numbers, or examples that are not in the text below.";

// Diagnostic questions for *targeted* recall. Their job is to expose gaps, but
// gently: a student scanning for what they do and do not know should not have to
// fight an exam. So these are SHORT and low-pressure — mostly factual checks the
// student answers by tapping an option or filling a blank — and the wrong options
// do the diagnosing. They are deliberately NOT the retest's shape, and their
// results feed the same gap analysis the free-recall path feeds.
const RECALL_QUESTION_SYSTEM =
  "Write short, friendly diagnostic questions that reveal whether a student still remembers and understands each weak idea. " +
  "This is a DIAGNOSTIC, not an exam: keep every question quick and low-pressure — the kind a student answers in a few seconds and moves on from. " +
  "Lean on short factual checks (a term, a definition, or the word that fills a blank) and let the options do the diagnosing: for a known misconception, make the wrong belief a tempting distractor so that holding it shows. " +
  "Write one question per weak idea (missing or misconception item), and set targetConcept to that item's exact conceptText (bare, never the [MISCONCEPTION] marker) so the answer is graded only against that idea. " +
  recallLevelDirective() +
  " ";

/**
 * The format mix for a recall set, as a deterministic instruction. The numbers
 * come from `recallFormatCounts` — the same source the parser and the fallback
 * trust — so the writer, the validator, and the no-model path agree on one
 * shape rather than three guesses. Subjects where a missing word is the natural
 * probe get more fill-in-the-blank; everything else is mostly multiple choice.
 */
export function recallFormatDirective(family: SubjectFamily): string {
  const counts = recallFormatCounts(RECALL_SET_SIZE, family);
  return (
    `Every question has a "format". Write exactly ${RECALL_SET_SIZE} questions in this mix: ` +
    `${counts.multiple_choice} "multiple_choice", ${counts.fill_blank} "fill_blank", ${counts.short_answer} "short_answer". ` +
    "- multiple_choice: offer four options, exactly one of which is correct and the others plausible but wrong; set answer to the EXACT text of the correct option, copied from options. " +
    "- fill_blank: the question contains one blank written as ____ whose missing word or short phrase IS the answer; set answer to that word or phrase (a couple of words at most). " +
    "- short_answer: a spoken question with no options and no answer; the student explains in their own words. " +
    'Return STRICT JSON: {"questions":[{"format":"multiple_choice|fill_blank|short_answer","question":"...","options":["...","...","...","..."],"answer":"<the correct option for multiple_choice, or the missing word for fill_blank>","level":"knowledge|comprehension|application|critical_thinking|compare_contrast","targetConcept":"<exact weak-idea conceptText>"}]}. '
  );
}

/**
 * The provider-enforced shape of a generated question set. "STRICT JSON" in the
 * prompt is only a request; handing the provider a schema makes the fields — and
 * crucially the `format` enum the recall mix depends on — a guarantee instead of
 * a hope. Without it a reply can drop `options`/`answer`, the parser then
 * downgrades every multiple choice to a spoken short answer, and the set
 * collapses into a run of "explain…" prompts. Recall requires `format`; retest
 * has no formats at all, so it does not.
 *
 * The ladder treats a schema the provider refuses as recoverable: `ask` retries
 * without it, so this stays a quality lever and never a hard dependency.
 */
function questionSetSchema(requireFormat: boolean): Record<string, unknown> {
  const item: Record<string, unknown> = {
    type: "object",
    additionalProperties: false,
    properties: {
      question: { type: "string" },
      level: { type: "string", enum: [...COGNITIVE_LEVELS] },
      targetConcept: { type: "string" },
      targetObjective: { type: "string" },
      beyondText: { type: "boolean" },
      format: { type: "string", enum: [...RECALL_FORMATS] },
      options: { type: "array", items: { type: "string" } },
      answer: { type: "string" },
    },
    required: requireFormat
      ? ["format", "question", "level"]
      : ["question", "level"],
  };
  return {
    type: "object",
    additionalProperties: false,
    properties: { questions: { type: "array", items: item } },
    required: ["questions"],
  };
}

// Exam-readiness questions for the retest. Written to a national-exam standard
// and deliberately a different pattern from a recall question: these must be
// hard, detailed, spread across all five cognitive levels, and include at least
// one scenario the textbook does not cover.
const RETEST_SYSTEM =
  "Write questions that prove a student is bulletproof on this chapter — exam-standard, and NEVER easy. " +
  "These are held to a national-exam standard and are a DIFFERENT pattern from a study check: do not simply ask the student to restate a definition. " +
  "Target every failed objective and every failed concept, probing the lowest mastery levels hardest. " +
  retestLevelDirective() +
  " Two rules make a question exam-ready: " +
  "(1) Demand precise detail — exact terms, values, steps, conditions, or examples — never a vague prompt. " +
  "(2) At least one question must go BEYOND the textbook: describe a novel scenario the chapter never covers and ask the student to reason it out using the chapter's ideas. Set beyondText true on exactly those questions. " +
  "Each question must ask the student to speak an explanation, definition, worked example, or reasoned judgement — never to pick an option or answer yes/no. " +
  "For questions that test a checklist idea, set targetConcept to that idea's exact conceptText (bare, never the [MISCONCEPTION] marker); for a beyond-textbook question you may also set targetObjective to the objective it serves. " +
  "Write 3-5 questions. " +
  'Return STRICT JSON: {"questions":[{"question":"...","level":"knowledge|comprehension|application|critical_thinking|compare_contrast","targetConcept":"<exact conceptText or omit>","targetObjective":"<objective text or omit>","beyondText":false}]}.';

/**
 * Transcribe the contents; do not interpret them.
 *
 * Written against the failure this replaced, twice over. Asked to *generate* a
 * structure — JSON with page coordinates it had no way to know, because it
 * never sees the pages the contents point at — every answer the model gave was
 * refused by the client for being incoherent. And on the books that needed it
 * most, a Grade 10 History textbook whose deterministic parse found nothing,
 * the fallback heading scan had already turned every "Part I: Choose the best
 * answer" exam section into a chapter.
 *
 * Copying lines is the task a model does reliably, even out of garbled OCR:
 * the wording, the numbering, the script, the printed page number at the end.
 * Everything after that — parsing the lines into units and topics, measuring
 * where the printed numbers land — is deterministic code the client already
 * trusts, and exam furniture never survives it: a line that is not a contents
 * entry matches none of the entry patterns and is dropped.
 */
const TRANSCRIBE_SYSTEM =
  "You transcribe the table of contents of a textbook from the text of its opening pages. " +
  "Output ONLY the contents entries, one per line, in book order. " +
  "Each line is one entry exactly as the book prints it: the entry's words, " +
  'then a space, then its page number — for example: "Unit 1: The Horn of Africa 17". ' +
  "Keep every title verbatim, in whatever script the book is written in, and keep " +
  'the numbering the book uses ("Unit 3", "UNIT TWO", "3.2"). ' +
  "Leave out dot leaders, page headers, page numbers standing alone, and anything " +
  "that is not a listed contents entry. " +
  "If these pages hold no table of contents, output nothing at all. " +
  "No JSON, no commentary, no words of your own.";

/**
 * The same transcription task, but from a photograph of the page.
 *
 * This rung exists for the book whose words will not extract and whose image
 * OCR is unusable — a two-column contents, a decorative font, a scan so noisy
 * the on-device reader returns fragments. The model is looking at the page, so
 * it can read what the text layer never held. The instruction is otherwise
 * identical to the text reader's, deliberately: the same client parser reads
 * the answer, so the answer must have the same one-entry-per-line shape, with
 * the printed page number at the end of each line.
 */
const TRANSCRIBE_IMAGE_SYSTEM =
  "You are shown an image of a page from a textbook — often its table of contents. " +
  "Transcribe its contents entries: output ONLY the entries, one per line, in book order. " +
  "Each line is one entry exactly as the page prints it: the entry's words, then a space, " +
  'then its page number — for example: "Unit 1: The Horn of Africa 17". ' +
  "Read across columns and down them in reading order, and keep every title verbatim, " +
  "in whatever script the book is written in. Keep the numbering the book uses " +
  '("Unit 3", "UNIT TWO", "3.2"). Leave out dot leaders, running headers, page numbers ' +
  "standing alone, and anything that is not a listed contents entry. " +
  "If the image holds no table of contents, output nothing at all. " +
  "No JSON, no commentary, no words of your own.";

// A vision read carries an image and is slower than a text call; give it room
// inside the shared budget without letting one page hold the whole request.
const IMAGE_READ_TIMEOUT_MS = 20_000;

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

// The user prompt handed to either question writer: the diagnosis, the
// checklist to grade against, and — for both families — the book's own stated
// objectives, so a question can hold the student to the author's contract and
// not only to the concept list. Exported so the writer inputs are testable
// without a live model.
export function questionUserPrompt(
  gaps: GapAnalysis,
  concepts: ConceptChecklistItem[],
  objectives: string[],
): string {
  const objectiveBlock = objectives.length
    ? `\n\nSTATED OBJECTIVES (the book's own contract; target these too):\n${objectives
        .map((o) => `- ${o}`)
        .join("\n")}`
    : "";
  return `GAP ANALYSIS:\n${gapsSummary(gaps)}\n\nCONCEPT CHECKLIST:\n${conceptsChecklist(concepts)}${objectiveBlock}`;
}

// Pull a question list out of the model reply. The level is validated against
// the shared taxonomy (an unknown one falls back to comprehension, the honest
// "explain it" reading), and the target concept/objective are carried through
// for the route to reconcile against stored rows — never trusted blindly.
function extractQuestions(raw: string, limit = 5): GeneratedQuestion[] | null {
  const data = parseJson<{ questions?: unknown[] }>(raw);
  if (!data || !Array.isArray(data.questions)) return null;
  const out: GeneratedQuestion[] = [];
  for (const q of data.questions) {
    if (typeof q !== "object" || q === null) continue;
    const record = q as Record<string, unknown>;
    const question = record.question;
    if (typeof question !== "string" || !question.trim()) continue;
    const str = (v: unknown) =>
      typeof v === "string" && v.trim() ? v.trim() : undefined;
    // Format is recall's business. A closed format is only trusted when it is
    // answerable: multiple choice needs two-plus options and an answer that
    // really is one of them, fill-in-the-blank needs the missing word. Anything
    // missing or inconsistent degrades to a spoken short answer rather than
    // shipping a question that cannot be graded.
    let format: RecallFormat | undefined = isRecallFormat(record.format)
      ? record.format
      : undefined;
    let options = Array.isArray(record.options)
      ? record.options
          .filter((o): o is string => typeof o === "string" && !!o.trim())
          .map((o) => o.trim())
      : undefined;
    let answer = str(record.answer);
    if (format === "multiple_choice") {
      if (
        !options ||
        options.length < 2 ||
        !answer ||
        !options.some((o) => judgeClosedAnswer(o, answer as string))
      ) {
        format = "short_answer";
        options = undefined;
        answer = undefined;
      }
    } else if (format === "fill_blank") {
      if (!answer) {
        format = "short_answer";
        options = undefined;
      } else {
        options = undefined;
      }
    } else if (format === "short_answer") {
      options = undefined;
      answer = undefined;
    }
    out.push({
      question: question.trim(),
      level: isCognitiveLevel(record.level) ? record.level : "comprehension",
      targetConcept: str(record.targetConcept),
      targetObjective: str(record.targetObjective),
      beyondText: record.beyondText === true,
      format,
      options,
      answer,
    });
    if (out.length >= limit) break;
  }
  return out.length ? out : null;
}

/**
 * The opening pages, labelled so the model can say which page it is looking
 * at if it must. The transcription itself carries no coordinates — the
 * printed numbers at the ends of the contents lines are the only pages that
 * matter, and the client measures where they land.
 */
export function contentsUserPrompt(pages: ContentsPage[]): string {
  return [
    "OPENING PAGES OF ONE TEXTBOOK, IN ORDER. Each block is labelled with its 0-based page index. " +
      "Transcribe the table of contents among them, one entry per line.",
    ...pages.map((page) => `[page ${page.index}]\n${page.text.trim()}`),
  ].join("\n\n");
}

// The title read understands the front matter it lives in: these pages open
// with a government banner, then the title, then a credits page full of names.
// Asking for the *subject and grade* instead of a verbatim cover line is what
// keeps the answer useful as a shelf label, whatever the cover is worded like.
const TITLE_SYSTEM =
  "You are handed the first pages of one textbook, extracted from its PDF text layer. " +
  "These pages are noisy: the cover repeats its words and usually wears a government " +
  'banner such as "Federal Democratic Republic of Ethiopia" above the title, and the ' +
  "title page lists writers, editors and publishers. " +
  "Answer with ONLY the book's title, the way a student would name it — the subject " +
  'and grade, e.g. "Biology Grade 10". ' +
  'Drop banner words and "Ministry of Education"; drop "Student Textbook" when the book ' +
  "names its subject. " +
  "One line, no quotes, no JSON, no commentary. " +
  "If no page names a book, output nothing.";

export function titleUserPrompt(pages: ContentsPage[]): string {
  return [
    "FIRST PAGES OF ONE TEXTBOOK, IN ORDER. Each block is labelled with its 0-based page index.",
    ...pages.map((page) => `[page ${page.index}]\n${page.text.trim()}`),
  ].join("\n\n");
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
  // A shed is NOT a degradation, and this is the whole reason admission is
  // checked before the fallback: if we refused to call the model because the
  // shared allowance or the open circuit said no, then the deterministic
  // fallback is not a lesser answer — it is a *false* one, indistinguishable
  // from a real diagnosis to the student reading it. Re-throw so the route
  // returns an honest "busy, try in N seconds" instead. Swallowing it here
  // would re-introduce exactly the bug the 2026-09-27 entry describes, one
  // layer above where it was fixed.
  if (isAiBusy(error)) throw error;

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
  async extractChapter(rawText: string): Promise<ChapterExtraction> {
    const fallback = () => fallbackExtraction(rawText);
    if (!anyAiAvailable()) return fallback();
    try {
      const raw = await ask(
        EXTRACT_SYSTEM,
        `CHAPTER TEXT:\n${rawText.slice(0, 24000)}`,
      );
      const concepts = extractItems(raw);
      // A reply that yields no usable concepts is malformed; the whole read
      // falls back together, so concepts and objectives come from one source
      // rather than a model/concept split that would look half-trusted.
      if (!concepts) return malformed("extractChapter", fallback);
      return {
        concepts,
        objectives: extractObjectiveItems(raw, rawText),
        estimated: false,
      };
    } catch (error) {
      return degraded("extractChapter", error, fallback);
    }
  },

  async gradeRecall(
    transcript: string,
    concepts: ConceptChecklistItem[],
    subject?: string,
  ): Promise<GapAnalysis> {
    const fallback = () =>
      withRecallEvidence(
        fallbackGrade(transcript, concepts),
        transcript,
        concepts,
      );
    if (!anyAiAvailable()) return fallback();
    try {
      const family = subject ? getFamily(subject) : "other";
      const dirs = getPhaseDirectives(family, "recall");
      const sysExtra = dirs.system?.length ? ` ${dirs.system.join(" ")}` : "";
      const raw = await ask(
        GRADE_SYSTEM + sysExtra,
        `CONCEPT CHECKLIST:\n${conceptsChecklist(concepts)}\n\nSTUDENT RECALL:\n${transcript}`,
      );
      const parsed = parseGaps(raw, concepts);
      return parsed
        ? withRecallEvidence(parsed, transcript, concepts)
        : malformed("gradeRecall", fallback);
    } catch (error) {
      return degraded("gradeRecall", error, fallback);
    }
  },

  async generateMicroLesson(
    gaps: GapAnalysis,
    _concepts: ConceptChecklistItem[],
    language: ContentLanguage = "en",
    options: { skipAi?: boolean; timeoutMs?: number; subject?: string } = {},
  ): Promise<MicroLesson> {
    const fallback = () => ({ text: fallbackLesson(gaps, language) });
    if (!anyAiAvailable()) return fallback();
    try {
      const family = options.subject ? getFamily(options.subject) : "other";
      const dirs = getPhaseDirectives(family, "lesson");
      const sysExtra = dirs.system?.length ? ` ${dirs.system.join(" ")}` : "";
      const raw = await ask(
        LESSON_SYSTEM + sysExtra + outputInstruction(language),
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

  /**
   * One "why this step is yours" line per plan step, in ONE provider call.
   *
   * This is the orientation the plan lives on: not a fact about the subject,
   * but the diagnosis handed back — "you said X, the chapter says it
   * differently". It is asked of the model in a single batched call, so the
   * whole plan costs one request, and falls back to the deterministic
   * diagnosis line for any concept the model skips, so a partial reply still
   * yields a usable plan.
   */
  async generatePlanWhyFirst(
    chapterText: string,
    requests: PlanWhyRequest[],
    language: ContentLanguage = "en",
    options: { skipAi?: boolean; timeoutMs?: number; subject?: string } = {},
  ): Promise<Map<string, string>> {
    const fallback = () => new Map<string, string>();
    if (options.skipAi || !anyAiAvailable() || requests.length === 0)
      return fallback();
    const deadline =
      Date.now() +
      Math.min(
        AI_TOTAL_BUDGET_MS,
        options.timeoutMs ?? STUDY_PLAN_CONTENT_BUDGET_MS,
      );
    const schema = {
      type: "object",
      properties: {
        steps: {
          type: "array",
          minItems: 1,
          maxItems: requests.length,
          items: {
            type: "object",
            properties: {
              index: {
                type: "integer",
                minimum: 1,
                maximum: requests.length,
              },
              why: { type: "string" },
            },
            required: ["index", "why"],
            additionalProperties: false,
          },
        },
      },
      required: ["steps"],
      additionalProperties: false,
    };
    const family = options.subject ? getFamily(options.subject) : "other";
    const dirs = getPhaseDirectives(family, "plan");
    const sysExtra = dirs.system?.length ? ` ${dirs.system.join(" ")}` : "";
    const system =
      "For each numbered study-plan step, write ONE short orienting line (at most 18 words) telling the student why this step is here FOR THEM. " +
      "Base it only on the concept, the failure mode, and the student's own words when given — never introduce a fact, example, number, or claim the anchor does not already state. " +
      "Do not greet, do not ask a question, and do not quote the passage. " +
      "Index entries must match the numbers in the request; reply with all of them. " +
      'Return strict JSON: {"steps":[{"index":1,"why":"..."}]}.' +
      sysExtra +
      outputInstruction(language);
    const user =
      `CHAPTER TEXT (context only, do not quote):\n${chapterText.slice(0, 12000)}\n\n` +
      requests
        .map(
          (request, index) =>
            `${index + 1}. CONCEPT: ${request.conceptText}\n   FAILURE MODE: ${request.gapType}\n   STUDENT SAID: ${request.studentWords ?? "(nothing on this)"}\n   ANCHOR: ${request.excerpt}`,
        )
        .join("\n\n");
    try {
      for (let attemptNumber = 0; attemptNumber < 2; attemptNumber += 1) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) return fallback();
        const raw = await ask(
          system +
            (attemptNumber === 1
              ? " Your previous answer was unusable. Return one short why line per index as strict JSON."
              : ""),
          user,
          { schema, timeoutMs: remaining },
        );
        const data = parseJson<{ steps?: unknown[] }>(raw);
        if (!data || !Array.isArray(data.steps)) continue;
        const whys = new Map<string, string>();
        for (const entry of data.steps) {
          if (!entry || typeof entry !== "object" || Array.isArray(entry))
            continue;
          const item = entry as Record<string, unknown>;
          const numeric =
            typeof item.index === "number" ? item.index : Number(item.index);
          const request =
            requests[Number.isInteger(numeric) ? numeric - 1 : -1];
          if (!request) continue;
          const why = typeof item.why === "string" ? item.why.trim() : "";
          if (!why || why.length > 180 || /https?:\/\/|www\./i.test(why))
            continue;
          whys.set(request.conceptText.trim().toLowerCase(), why);
        }
        if (whys.size > 0) return whys;
      }
      return malformed("generatePlanWhyFirst", fallback);
    } catch (error) {
      return degraded("generatePlanWhyFirst", error, fallback);
    }
  },

  async generateGuideSection(
    conceptText: string,
    chapterText: string,
    language: ContentLanguage = "en",
    // Set when the caller has already spent this student's request budget on
    // earlier concepts in the same response. The lexical fallback still comes
    // back — a student asking for a chapter should get a chapter — but no
    // provider call is made, so a cold guide cannot quietly spend ten requests
    // behind one click.
    options: { skipAi?: boolean; subject?: string } = {},
  ): Promise<GuideSection> {
    // The anchor is computed, not generated: a model asked for a location in
    // the text invents one, and an invented page number is worse than none.
    const anchor = sourceAnchor(conceptText, chapterText);
    const fallback = (): GuideSection =>
      fallbackSection(conceptText, chapterText, language);
    if (options.skipAi) return fallback();
    if (!anyAiAvailable()) return fallback();
    try {
      const raw = await ask(
        SECTION_SYSTEM + outputInstruction(language),
        `CONCEPT TO EXPLAIN:\n${conceptText.trim()}\n\nCHAPTER TEXT (the only source of facts):\n${chapterText.trim()}`,
      );
      const data = parseJson<Record<string, unknown>>(raw);
      const what =
        data && typeof data.what === "string" ? data.what.trim() : "";
      // A section is only worth storing if it explains something. Without `what`
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

  async generateRecallQuestions(
    gaps: GapAnalysis,
    concepts: ConceptChecklistItem[],
    objectives: string[],
    language: ContentLanguage = "en",
    options: {
      skipAi?: boolean;
      timeoutMs?: number;
      subject?: string;
      chapterText?: string;
    } = {},
  ): Promise<GeneratedQuestion[]> {
    const family = options.subject ? getFamily(options.subject) : "other";
    const fallback = () =>
      fallbackQuestions(gaps, "recall", language, {
        concepts,
        chapterText: options.chapterText,
        family,
      });
    if (!anyAiAvailable()) return fallback();
    try {
      // Recall questions are diagnostic, so they take the *recall* family
      // directives (probe for gaps) — not the retest's exam-hard bullets.
      const dirs = getPhaseDirectives(family, "recall");
      const sysExtra = dirs.system?.length ? ` ${dirs.system.join(" ")}` : "";
      const raw = await ask(
        RECALL_QUESTION_SYSTEM +
          recallFormatDirective(family) +
          sysExtra +
          outputInstruction(language),
        questionUserPrompt(gaps, concepts, objectives),
        { schema: questionSetSchema(true) },
      );
      return (
        extractQuestions(raw, RECALL_SET_SIZE) ??
        malformed("generateRecallQuestions", fallback)
      );
    } catch (error) {
      return degraded("generateRecallQuestions", error, fallback);
    }
  },

  async generateRetestQuestions(
    gaps: GapAnalysis,
    concepts: ConceptChecklistItem[],
    objectives: string[],
    language: ContentLanguage = "en",
    options: { skipAi?: boolean; timeoutMs?: number; subject?: string } = {},
  ): Promise<GeneratedQuestion[]> {
    const fallback = () => fallbackQuestions(gaps, "retest", language);
    if (!anyAiAvailable()) return fallback();
    try {
      const family = options.subject ? getFamily(options.subject) : "other";
      const dirs = getPhaseDirectives(family, "retest");
      const sysExtra = dirs.system?.length ? ` ${dirs.system.join(" ")}` : "";
      const raw = await ask(
        RETEST_SYSTEM + sysExtra + outputInstruction(language),
        questionUserPrompt(gaps, concepts, objectives),
        { schema: questionSetSchema(false) },
      );
      const questions = extractQuestions(raw, 5);
      if (!questions) return malformed("generateRetestQuestions", fallback);
      // A retest that never climbs or never leaves the textbook is not the proof
      // it was written to be. Surface it as a signal; do not fake a fix.
      if (retestIsSoft(questions)) {
        aiTelemetry.softRetest += 1;
        console.error(
          "[ai] generateRetestQuestions produced a soft set (fewer than 3 levels or no beyond-text question)",
        );
      }
      return questions;
    } catch (error) {
      return degraded("generateRetestQuestions", error, fallback);
    }
  },

  async parseContents(pages: ContentsPage[]): Promise<ContentsParse> {
    // Nothing to read: an empty transcript IS the answer, and it is the same
    // one the caller reaches on its own. There is no lexical contents parser
    // worth synthesising here — the deterministic one already ran and came up
    // empty, which is the whole reason this method exists.
    const none: ContentsParse = { text: "" };
    if (pages.length === 0) return none;
    // No key: the model was never asked, and telling a student "this book has
    // no contents" for that is a sentence they cannot act on. The reason is
    // handed to the screen instead, so a deployment missing its key shows as
    // exactly what it is rather than as a chapter list that keeps guessing.
    if (!anyAiAvailable()) {
      return {
        text: "",
        refused:
          "The AI reader is not configured on this server, so it was never asked.",
      };
    }
    try {
      const raw = await ask(TRANSCRIBE_SYSTEM, contentsUserPrompt(pages), {
        text: true,
      });
      return { text: raw.trim().slice(0, 20_000) };
    } catch (error) {
      return degraded("parseContents", error, () => none);
    }
  },

  async parseImageContents(image: ContentsImage): Promise<ContentsParse> {
    const none: ContentsParse = { text: "" };
    // A vision read needs Gemini specifically; Groq cannot see the image. Say
    // so plainly rather than degrade, so the screen can offer the Pages tab
    // instead of pretending the book was unreadable.
    if (!isAiAvailable()) {
      return {
        text: "",
        refused:
          "The AI image reader is not configured on this server, so it was never asked.",
      };
    }
    try {
      const raw = await ask(
        TRANSCRIBE_IMAGE_SYSTEM,
        "Transcribe the table of contents shown in this image, one entry per line.",
        { text: true, image, timeoutMs: IMAGE_READ_TIMEOUT_MS },
      );
      return { text: raw.trim().slice(0, 20_000) };
    } catch (error) {
      return degraded("parseImageContents", error, () => none);
    }
  },

  async parseTitle(pages: ContentsPage[]): Promise<TitleParse> {
    const none: TitleParse = {};
    if (pages.length === 0) return none;
    if (!anyAiAvailable()) {
      return {
        refused:
          "The AI reader is not configured on this server, so it was never asked.",
      };
    }
    try {
      const raw = await ask(TITLE_SYSTEM, titleUserPrompt(pages), {
        text: true,
      });
      const title = raw
        .trim()
        .replace(/^["'\u201C\u201D]+|["'\u201C\u201D]+$/g, "")
        .slice(0, 300);
      return title ? { title } : none;
    } catch (error) {
      return degraded("parseTitle", error, () => none);
    }
  },
};
