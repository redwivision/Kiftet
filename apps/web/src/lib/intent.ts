// End-of-speech intent detection.
//
// Voxide keeps the mic open until the agent decides the turn is done, so the
// study loop has always relied on a ring tap to close a recall or an answer.
// These helpers let the app recognise the student's own "I'm done" cues and
// close the turn itself — no tap needed — and separate them from real
// farewells ("bye", "I'm done studying") that should end the whole session.
//
// Both English and Amharic cues are always live, whichever language the pref is
// on. The pref decides what the *recognizer* hears, not what counts as a cue:
// a student whose pref is አማርኛ still says "that's all", and one studying in
// English still says "ያለቀለም". Matching both is the forgiving reading, and a
// missed cue costs a tap while a false one only ends a turn a moment early.
//
// Note the deliberate absence of `\b` on the Amharic patterns: JS `\w` is
// ASCII-only even with the `u` flag, so word boundaries do not exist between
// Ethiopic codepoints and would match the wrong places. The Amharic phrases are
// distinctive enough to match as plain literals.
//
// Equally deliberate: no `g` flag. These are module-level regexes reused across
// every call, and `g` makes `exec` stateful — `lastIndex` carries over from one
// student's turn to the next, so the second identical cue in a session starts
// its search partway through the string and silently fails to match. `u` alone
// is what Ethiopic needs; `g` is what broke it.

export interface EndMarker {
  /** The phrase that matched, lowercased, as found in `text`. */
  phrase: string;
  /** Character offset in `text` where the closing phrase starts. */
  index: number;
}

// Phrases that mean "this is the end of what I'm saying" — the recall or a
// retest answer is complete, so the loop should grade it and move on.
const BOUNDARY_PATTERNS: RegExp[] = [
  /that'?s(?: about)? all(?: i (?:remember|know|can remember|can think of))?/i,
  /that'?s everything/i,
  /that'?s what i remember/i,
  /that'?s(?: pretty| about)? it/i,
  /i think that'?s it/i,
  /i(?:'m| am) done/i,
  /i(?:'m| am) finished/i,
  /i'?ve said everything/i,
  /i'?ve said (?:all|everything) i know/i,
  /i don'?t remember anything else/i,
  /i can'?t think of anything else/i,
  /nothing else/i,
  /that'?s all for now/i,
  /that'?s my answer/i,
  /next question/i,
  /okay? (?:i'?m |i am )?done/i,
  // አማርኛ — "that is all / I'm finished".
  /ያለቀለም/u,
  /ያለቀለም ምንም/u,
  /ተጠናቋለሁ/u,
  /ተጠናቋል/u,
  /ጨርሻቼ የለም/u,
  /ሌላ የለም/u,
  /ሌላ ሰራም የለም/u,
  /ምንም አልገለም/u,
  /የምንም አልገለም/u,
  /ቀጣይ ጥያቄ/u,
  /ይህም ምላሽ/u,
  /ተጠናቋለሁ ለአሁን/u,
];

// Phrases that mean "I'm leaving / I'm done for the session" — the whole study
// session should be closed and the student sent back to the dashboard.
//
// "ሰላም" (selam) is intentionally absent: it is the everyday Amharic greeting
// *and* a parting word, and a student who opens an answer with it would lose
// the whole session. The unambiguous farewells below carry the same meaning.
const SESSION_END_PATTERNS: RegExp[] = [
  /\bbye\b/i,
  /\bgoodbye/i,
  /see you later/i,
  /see ya/i,
  /i(?:'m| am) (?:leaving|done for (?:today|now|the day)|done studying|all done)/i,
  /i(?:'ve| have) (?:got to|gotta) go/i,
  /i need to go/i,
  /close (?:it|the app|this|the session)/i,
  /end (?:the |this )?session/i,
  /stop (?:the |this )?session/i,
  /(?:that'?s|that is) (?:it|all) for (?:today|now|the day)/i,
  // አማርኛ — "goodbye / I am leaving / I am done".
  /ደህና ሁን/u,
  /ስብርስ/u,
  /እየሄድ ነው/u,
  /ለነዚህ ጊዜ አልቋል/u,
  /ለዛሬ አልቋል/u,
  /ጭርቻውን ዝጋ/u,
  /ድር ጨርሽ/u,
];

function firstMatch(text: string, patterns: RegExp[]): EndMarker | null {
  const lower = text.toLowerCase();
  let best: EndMarker | null = null;
  for (const pattern of patterns) {
    const match = pattern.exec(lower);
    if (!match) continue;
    if (!best || match.index < best.index) {
      best = { phrase: match[0], index: match.index };
    }
  }
  return best;
}

/** Earliest "this is the end of my answer" cue in `text`, if any. */
export function findBoundaryEnd(text: string): EndMarker | null {
  return firstMatch(text, BOUNDARY_PATTERNS);
}

/** Earliest explicit farewell/session-close cue in `text`, if any. */
export function findSessionEnd(text: string): EndMarker | null {
  return firstMatch(text, SESSION_END_PATTERNS);
}

/** True when `text` reads as an explicit goodbye / "close the session". */
export function detectSessionEnd(text: string): boolean {
  return firstMatch(text, SESSION_END_PATTERNS) !== null;
}

/** Everything in `text` that comes before a closing cue's `index`. */
export function leadingText(text: string, index: number): string {
  return text.slice(0, index).replace(/\s+/g, " ").trim();
}

/**
 * Word count that works on any script.
 *
 * The guard that uses this wants "is there more after the cue?", so it has to
 * count Ethiopic words too. The ASCII class it replaced (`[^a-z0-9\s]`) deleted
 * every Amharic codepoint *before* counting, which made the remainder read as
 * zero words — so the guard could never tell a mid-sentence cue from a closing
 * one in Amharic, and an "ያለቀለም" buried mid-answer would end the answer.
 *
 * Amharic separates words with spaces, so \p{L} runs are the right unit. The
 * \p{M} continuation covers combining marks that attach to a base letter.
 */
export function countWords(text: string): number {
  return (text.match(/\p{L}[\p{L}\p{M}]*/gu) ?? []).length;
}
