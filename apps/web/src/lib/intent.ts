// End-of-speech intent detection.
//
// Voxide keeps the mic open until the agent decides the turn is done, so the
// study loop has always relied on a ring tap to close a recall or an answer.
// These helpers let the app recognise the student's own "I'm done" cues and
// close the turn itself — no tap needed — and separate them from real
// farewells ("bye", "I'm done studying") that should end the whole session.

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
];

// Phrases that mean "I'm leaving / I'm done for the session" — the whole study
// session should be closed and the student sent back to the dashboard.
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
