// Bet 4 (STRATEGY.md): Amharic is a full feature, not a skinned English app.
//
// English is the source of truth for keys; `am` must cover every key (typed).
// Strings that carry dynamic values use `{name}` tokens filled by `t()`.
//
// Both-script scope discipline: a phrase only gets added here once the surface
// it lives on is actually wired to `t()` — a key nobody reads is a lie in the
// corpus. Unwired surfaces stay in English until their slice lands.

export type Language = "en" | "am";

export const en = {
	// ── Header chrome ─────────────────────────────────────────────
	tagline: "Close the gap",
	"nav-home": "Home",
	"nav-study": "Study",
	"select-language": "Select language",

	// ── Study loop steps (the four pills) ─────────────────────────
	"step-speak": "Speak",
	"step-diagnose": "Diagnose",
	"step-relearn": "Relearn",
	"step-retest": "Retest",

	// ── Session header / framing ──────────────────────────────────
	"step-of": "Step {a} of {b}",
	"loop-aria": "Study loop",
	opening: "Opening your study session…",
	"session-missing": "This session isn't here",
	"session-missing-body":
		"It may have been created in another browser, or the link has a typo.",
	"back-to-chapters": "Back to chapters",
	"something-went-wrong": "Something went wrong",
	retry: "Retry",
	dismiss: "Dismiss",
	notice: "Notice:",
	"read-notice": "Read this notice out loud",

	// ── Phase headings ────────────────────────────────────────────
	"recall-title": "Remember it out loud",
	"recall-text":
		"This is the diagnosis. Say what you know about the chapter in your own words — missing some is the whole point. Nobody covers a chapter cold.",
	"gaps-title": "Your starting picture",
	"gaps-text":
		"The solid ideas stay. The open ones are what the short version will fix. Bars that sit taller matter more.",
	"lesson-title": "The short version",
	"lesson-text":
		"Just what you missed — nothing more. Read it now, or hear it spoken back to you.",
	"retest-title": "A short retest",
	"retest-text":
		"These questions come after the lesson, so they test what stuck — not what you just heard.",
	"retest-done-text":
		"You made it through the set. See whether the short version closed the gaps.",

	// ── Primary CTAs ──────────────────────────────────────────────
	preparing: "Preparing the short version…",
	"hear-short-version": "Hear the short version",
	"skip-lesson": "Skip the lesson, take the test",
	"stop-reading": "Stop reading",
	"read-it-to-me": "Read it to me",
	"ready-to-be-tested": "I'm ready to be tested",
	"back-to-gaps": "Back to my gaps",
	"question-of": "Question {a} of {b}",
	"all-answered": "All answered",
	"see-result": "See your result",
	grading: "Grading…",
	"question-i": "Question {n}",
	right: "right",
	"still-open": "still open",
	"you-said": "You said:",
	"recorded-by-voice": "— recorded by voice —",
	landed: "Landed",
	"still-open-exam": "Still open for exam day",
	"result-none-title": "Nothing came up missing.",
	"result-none-body":
		"Every concept this chapter is checked against came out solid — cold, no notes. That's exactly the outcome this loop is built for.",
	"result-gap-title": "Gap closed.",
	"result-gap-body":
		"The short version filled what was missing, and the retest shows it — the score climbed. That's the whole point of Kiftet.",
	"result-open-title": "A gap is still open.",
	"result-open-body":
		"Not everything sticks on the first pass — now you know which ideas are still open, so the next pass is faster than the first.",
	"retest-the-gaps": "Retest the gaps",
	"relearn-short-version": "Relearn the short version",
	"start-over": "Start over with a cold recall",
	"come-back-later": "Come back to this later",
	"session-time": "Session time",
	"under-a-minute": "under a minute",
	minutes: "{n} minutes",
	minute: "{n} minute",
	"done-for-now": "Done for now",

	// ── Offline banner (bet 3 honest copy) ────────────────────────
	"cl-offline":
		"No connection — the chapters and checklists you saved are still here, but grading needs to reach Kiftet.",
	"saved-one": "1 saved answer",
	"saved-many": "{n} saved answers",
	"back-grading": "Back online — grading {n}…",
	"back-applied-one":
		"Back online — this saved answer is having its result applied.",
	"back-applied-many":
		"Back online — {n} saved answers are having their results applied.",
	"offline-queued-one":
		"No connection — this saved answer will be graded when you're back online.",
	"offline-queued-many":
		"No connection — {n} saved answers will be graded when you're back online.",
	"try-again": "Try again",
	"saved-waiting": "Saved — waiting on a connection",
	"queued-recall":
		"Your words are saved on this phone — they'll be graded the moment you're back online. Nothing here is final until then.",
	"queued-answer":
		"Your answer is saved on this phone — it will be graded the moment you're back online. Nothing here is final until then.",
} as const;

export type MessageKey = keyof typeof en;

export const am: Record<MessageKey, string> = {
	// ── Header chrome ─────────────────────────────────────────────
	tagline: "ክፍተቱን ዝጋ",
	"nav-home": "መነሻ",
	"nav-study": "ጥናት",
	"select-language": "ቋንቋ ምረጥ",

	// ── Study loop steps (the four pills) ─────────────────────────
	"step-speak": "ተናገር",
	"step-diagnose": "መርምር",
	"step-relearn": "እንደገና ተማር",
	"step-retest": "ድጋሚ ፈተና",

	// ── Session header / framing ──────────────────────────────────
	"step-of": "እርምጃ {a} ከ {b}",
	"loop-aria": "የጥናት ዑደት",
	opening: "የጥናት ክፍለ ጊዜህ እየተከፈተ ነው…",
	"session-missing": "ይህ ክፍለ ጊዜ እዚህ የለም",
	"session-missing-body":
		"በሌላ ብራውዘር የተፈጠረ ሊሆን ይችላል፣ ወይም በአገናኙ ላይ ስህተት ሊኖር ይችላል።",
	"back-to-chapters": "ወደ ምዕራፎች ተመለስ",
	"something-went-wrong": "የሆነ ችግር ተከስቷል",
	retry: "እንደገና ሞክር",
	dismiss: "ዝጋ",
	notice: "ማስታወቂያ:",
	"read-notice": "ይህን ማስታወቂያ ጮክ ብለህ አንብብ",

	// ── Phase headings ────────────────────────────────────────────
	"recall-title": "ጮክ ብለህ አስታውስ",
	"recall-text":
		"ይህ ምርመራ ነው። ስለ ምዕራፉ የምታውቀውን በራስህ ቃላት ተናገር — አንዳንዱን ማስታታት ሙሉ እቅድ ነው። ማንም ምዕራፍን ሳያጠናው ሙሉ በሙሉ አያውቀውም።",
	"gaps-title": "የመነሻ ሁኔታህ",
	"gaps-text":
		"የተረጋገጡት እውቀቶች ይቆያሉ። ክፍት የሆኑትን አጭሩ ማብራሪያ ያስተካክላል። ረዥሙ አምዶች የበለጠ አስፈላጊ ናቸው።",
	"lesson-title": "አጭሩ ማብራሪያ",
	"lesson-text": "ያመለጠህን ብቻ — ከዚያ ያለፈ ምንም። አሁን አንብበው፣ ወይም ተናግሮ ስማው።",
	"retest-title": "አጭር ድጋሚ ፈተና",
	"retest-text":
		"እነዚህ ጥያቄዎች ከትምህርቱ በኋላ ይመጣሉ፣ ስለዚህ የተረጋገጠውን ይፈትናሉ — አሁን የሰማኸውን አይደለም።",
	"retest-done-text": "ስብስቡን አጠናቀህ። አጭሩ ማብራሪያ ክፍተቶቹን አስተካክሏል እንደሆነ ተመልከት።",

	// ── Primary CTAs ──────────────────────────────────────────────
	preparing: "አጭሩ ማብራሪያ እየተዘጋጀ ነው…",
	"hear-short-version": "አጭሩ ማብራሪያ ስማ",
	"skip-lesson": "ትምህርቱን ዝለል፣ ፈተናውን ውሰድ",
	"stop-reading": "ማንበብ አቁም",
	"read-it-to-me": "አንብብልኝ",
	"ready-to-be-tested": "ለመፈተን ዝግጁ ነኝ",
	"back-to-gaps": "ወደ ክፍተቶቼ ተመለስ",
	"question-of": "ጥያቄ {a} ከ {b}",
	"all-answered": "ሁሉም ተመልሷል",
	"see-result": "ውጤትህን ተመልከት",
	grading: "እየተመዘገበ ነው…",
	"question-i": "ጥያቄ {n}",
	right: "ተረጋግጧል",
	"still-open": "አሁንም ክፍት",
	"you-said": "አንተ ብለሃል:",
	"recorded-by-voice": "— በድምጽ ተመዝግቧል —",
	landed: "ደርሷል",
	"still-open-exam": "ለፈተና ቀን አሁንም ክፍት",
	"result-none-title": "ምንም አልጠፋም።",
	"result-none-body":
		"ይህ ምዕራፍ የተረጋገጠባቸው እውቀቶች ሁሉ ጠንካራ ሆነው ተገኝተዋል — በቀዝቃዛ አእምሮ፣ ያለ ማስታወሻ። ይህ በትክክል ይህ ዑደት የተሰራበት ውጤት ነው።",
	"result-gap-title": "ክፍተቱ ተዘግቷል።",
	"result-gap-body":
		"አጭሩ ማብራሪያ ያመለጠውን ሞላው፣ ድጋሚ ፈተናውም ያሳየዋል — ውጤቱ ጨምሯል። ይህ የኪፍተት ዋና ነጥብ ነው።",
	"result-open-title": "አንድ ክፍተት አሁንም ክፍት ነው።",
	"result-open-body":
		"ሁሉም በመጀመሪያ ሙከራ አይያዝም — አሁን የትኞቹ ሀሳቦች ክፍት እንደሆኑ ታውቃለህ፣ ስለዚህ ቀጣዩ ሙከራ ከመጀመሪያው ፈጣን ይሆናል።",
	"retest-the-gaps": "ክፍተቶቹን ድጋሚ ፈትን",
	"relearn-short-version": "አጭሩን ማብራሪያ እንደገና ተማር",
	"start-over": "በቀዝቃዛ ማስታወስ ከመጀመሪያ ጀምር",
	"come-back-later": "ወደዚህ በኋላ ተመለስ",
	"session-time": "የጥናት ጊዜ",
	"under-a-minute": "ከአንድ ደቂቃ በታች",
	minutes: "{n} ደቂቃዎች",
	minute: "{n} ደቂቃ",
	"done-for-now": "ለአሁን በቃ",

	// ── Offline banner (bet 3 honest copy) ────────────────────────
	"cl-offline":
		"ግንኙነት የለም — ያስቀመጥካቸው ምዕራፎች እና ቼክሊስቶች አሉ፣ ግን ውጤት መስጠት ኪፍተትን መድረስ ያስፈልገዋል።",
	"saved-one": "1 የተቀመጠ መልስ",
	"saved-many": "{n} የተቀመጡ መልሶች",
	"back-grading": "እንደገና ተያይዟል — {n} እየተመዘገበ…",
	"back-applied-one": "እንደገና ተያይዟል — ይህ የተቀመጠ መልስ ውጤቱን እየተቀበለ ነው።",
	"back-applied-many": "እንደገና ተያይዟል — {n} የተቀመጡ መልሶች ውጤታቸውን እየተቀበሉ ነው።",
	"offline-queued-one": "ግንኙነት የለም — ይህ የተቀመጠ መልስ እንደገና ስትገናኝ ይስተካከላል።",
	"offline-queued-many": "ግንኙነት የለም — {n} የተቀመጡ መልሶች እንደገና ስትገናኝ ይስተካከላሉ።",
	"try-again": "እንደገና ሞክር",
	"saved-waiting": "ተቀምጧል — ግንኙነትን በመጠባበቅ ላይ",
	"queued-recall":
		"ቃላቶችህ በዚህ ስልክ ተቀምጠዋል — እንደገና ሲገናኝ በቅጽበት ይስተካከላሉ። እስከዚያ ድረስ ምንም የመጨረሻ አይደለም።",
	"queued-answer":
		"መልስህ በዚህ ስልክ ተቀምጧል — እንደገና ሲገናኝ በቅጽበት ይስተካከላል። እስከዚያ ድረስ ምንም የመጨረሻ አይደለም።",
};

export const messages: Record<Language, Record<MessageKey, string>> = {
	en,
	am,
};

export function t(
	lang: Language,
	key: MessageKey,
	params?: Record<string, string | number>,
): string {
	const template = messages[lang][key];
	if (!params) return template;
	return template.replace(/\{(\w+)\}/g, (match, name: string) => {
		const value = params[name];
		return value == null ? match : String(value);
	});
}
