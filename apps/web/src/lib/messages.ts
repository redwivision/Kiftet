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

	// ── Dashboard chrome ─────────────────────────────────────────
	"study-room": "The study room",
	"dash-title": "Pick a chapter, then speak.",
	"dash-text":
		"Each chapter runs the same loop — recall, diagnose, relearn, retest. You'll see your coverage after each recall, and again at the end.",
	"study-by-syllabus": "Study by syllabus",
	"add-textbook": "Add your textbook",
	"demo-label": "Live demo",
	"demo-banner":
		" — this study room isn't saved to an account. Sign up to keep your progress.",
	"create-free-account": "Create a free account",
	"ai-calls-minute": "AI calls this minute:",
	"of-left": "{remaining} of {limitPerMinute} left",
	"budget-out": " — out. Try again in a moment.",
	"budget-careful": " — spend carefully.",
	"new-textbooks-today": "New textbooks today:",
	"textbooks-max": "{n} max (demo)",
	"misconception-map": "The national misconception map",
	"misconception-title": "What students most often get wrong — {subject}",
	"misconception-text":
		"Anonymized across every student here. A wrong turn only appears once {threshold} or more students hit it — this stays aggregate, never individual.",
	"unit-of": "· Unit {n}",
	"room-unreachable": "Couldn't reach the study room",
	"offline-saved": "Offline — saved chapters",
	"offline-saved-text":
		"This list was loaded from this phone. Starting fresh work needs a connection — anything graded earlier stays saved.",
	"empty-none": "Nothing to diagnose yet.",
	"empty-none-text":
		"The study room is empty. Chapters appear here the moment they're loaded in — then this room runs the recall loop on them.",
	"add-book-device": "Add your textbook — it's on your device, not ours",
	"opening-ellipsis": "Opening…",
	"start-review": "Start review",
	"card-promise": "Speak what you remember, see what's missing, close it.",
	"session-open": "A study session is open",
	resume: "Resume",
	completed: "completed",
	"last-session": "Last session: {delta}",

	// ── Syllabus chrome ──────────────────────────────────────────
	"syllabus-title": "The units, not just the chapters.",
	"syllabus-text":
		"Match the chapters you have to the national syllabus, then see which units are solid and which still have gaps — one study session at a time.",
	"back-dash": "← Dashboard",
	"syllabus-error": "Couldn't load the syllabus",
	"syllabus-empty":
		"No syllabuses are set up yet. The Biology, Grade 12 seed arrives with the next server deploy.",
	"unit-provisional": "Provisional units.",
	"unit-provisional-text":
		"The unit list here is a stand-in until it's verified against the official EHEEE syllabus — the structure is real, the names aren't final.",
	"unit-verified": "Verified.",
	"unit-verified-text": "Unit list compiled from the {source}",
	"syllabus-no-units": "This syllabus has no units on the server yet.",
	"unassigned-title": "Unassigned chapters",
	"unassigned-text":
		"These {subject} chapters aren't matched to a unit yet. Pick one below to slot them in.",
	"unit-of-label": "Unit {n}",
	"chapter-covered": "{covered}/{total} chapters covered",
	"pct-unit": "{pct}% of this unit",
	"no-chapters-mapped": "No chapters mapped yet",
	"map-chapter-text":
		"Map a chapter to this unit from the unassigned list below, or study it once it's in.",
	"not-studied": "not studied yet",
	study: "Study",
	"map-aria": "Map this chapter to a unit",
	"no-unit": "No unit",
	"unit-option": "Unit {n} — {title}",
	"unit-moved": "Chapter moved to that unit.",
	"unit-unassigned": "Chapter unassigned.",

	// ── Textbooks chrome ─────────────────────────────────────────
	"your-textbooks": "Your textbooks",
	"byob-title-full": "Bring your own book.",
	"textbooks-text":
		"Upload a PDF (up to {max} MB) or paste text. It's read on your device — the file never leaves your phone — and the book's own table of contents is split into chunks, each becoming its own study loop.",
	chunk: "{n} chunk",
	"no-chunks": "No chunks yet.",
	"reading-device": "Reading your book on this device…",
	"importing-room": "Importing into your study room",
	"ready-import": "Ready to import",
	cancel: "Cancel",
	"chunk-progress": "{progress} of {total} chunks",
	"already-in": "In",
	"already-here": "Already here",
	failed: "Failed",
	"building-checklist": "Building checklist…",
	"new-label": "New",
	"import-hint":
		"Chunks import one at a time, and finished ones are skipped if you leave and come back. Weak connection? Small text only — never the file.",
	"nothing-new": "Nothing new to import",
	"retry-failed": "Retry {n} failed chunk",
	"retry-failed-many": "Retry {n} failed chunks",
	"import-n": "Import {n} chunk",
	"import-n-many": "Import {n} chunks",
	"preview-coming": "Preview — import coming soon",
	"start-over-import": "Start over",
	"preview-mode-text":
		"Preview mode: this split happened on your device and nothing was saved or sent to the AI. Turning the import on is the next step.",
	"preview-mode": "Preview mode.",
	"preview-mode-note":
		"You can try the on-device chapter split below — nothing is saved and nothing is sent. Live import is the next step.",
	"add-textbook-label": "Add a textbook",
	"next-book": "The next book you study could be yours.",
	"book-title": "Book title",
	"grade-example": "e.g. Grade 9 Physics",
	"subject-label": "Subject",
	"physics-example": "e.g. Physics",
	"chapter-language": "Chapter language",
	"lang-en": "English",
	"lang-am": "Amharic",
	"lang-om": "Afaan Oromoo",
	"lang-other": "Other",
	"where-content": "Where is the content?",
	"pdf-file": "PDF file",
	"paste-text": "Paste text",
	"choose-pdf": "Choose a PDF",
	"pdf-chosen": "{size} MB — read on this device, up to {max} MB",
	"pdf-scan-note":
		"PDFs up to {max} MB. Scanned (image-only) PDFs have no text to study — paste the text instead.",
	"paste-placeholder":
		"Paste the book's text here (a few chunks' worth at a time). Headings like \u201CUnit 1\u201D or \u201Cምዕራፍ 2\u201D split it into study chunks for you.",
	characters: "{n} characters",
	"headings-detect":
		"Chapter headings like \u201CUnit 1\u201D or \u201Cምዕራፍ 2\u201D are detected automatically.",
	"scan-chunks": "Scan into chunks",
	"plan-confirm": "You'll confirm the chunks before anything is imported.",
	"demo-budget":
		"Demo rooms run on a small daily budget — your dashboard shows what's left. Signed-in users get more when we open the doors.",
	"book-on-shelf": "\u201C{title}\u201D is on the shelf.",
	"chunk-failed": "{n} chunk didn't land. Retry to finish.",
	"chunks-failed": "{n} chunks didn't land. Retry to finish.",
	"nothing-to-import": "Nothing to import — the text looks empty.",

	// ── Voice-test harness ───────────────────────────────────────
	"vt-nothing": "Nothing to see here",
	"vt-nothing-text":
		"The study room lives in the chapters, not the test bench.",
	"go-to-chapters": "Go to your chapters",
	"voice-test": "Voice test",
	loading: "Loading…",
	"voxide-key-missing": "Voxide key missing",
	transcript: "Transcript",
	"nothing-yet": "Nothing yet — say something…",
	"you-label": "You",
	"kiftet-label": "Kiftet",
	"vt-idle": "Tap the ring and talk — anything.",
	"vt-armed": "Ready.",
	"vt-connecting": "Connecting to the voice agent…",
	"vt-listening": "Listening… tap the ring again to stop me.",
	"vt-thinking": "Thinking… tap the ring again to cancel.",
	"vt-speaking": "Speaking… tap the ring again to cut me off.",
	"vt-executing": "Running the action… tap the ring again to cancel.",
	"vt-error": "Something went wrong. Tap to retry.",

	// ── Home / landing page ──────────────────────────────────────
	"hero-eyebrow": "Kiftet · spoken study review for Ethiopian students",
	"hero-gap": "Close the gap.",
	"hero-87":
		"87 in every 100 students fail the national exam. Trying harder isn't the answer — knowing which gaps are yours is.",
	"hero-sub":
		"Kiftet listens to what you remember out loud, finds the specific ideas that didn't stick, teaches only those in a short spoken lesson — then retests what stayed. Not another question bank. A diagnosis.",
	"start-closing": "Start closing your gaps",
	"how-loop-works": "How the loop works",
	"no-account": "No account?",
	"demo-jump": "Jump straight into the live demo",
	"stat-87a":
		"of the {count} students who sat the 2026 national exam were still failed by the system — in the best result the country has recorded.",
	"stat-87b": "{schools} schools had zero students pass.",
	"stat-absent":
		"Students weren't absent. They sat through the classes. What's missing isn't exposure — it's knowing, before the exam, which specific ideas didn't stick.",
	"loop-title": "Four steps. One loop. Only the gaps.",
	"loop-sub":
		"The sequence is the whole product — recall, diagnose, relearn, retest. Nothing in Kiftet exists outside it.",
	"l-speak-title": "Say what you remember",
	"l-speak-text":
		"Pick a chapter and explain it out loud, no notes, no prompts. Speaking forces clarity — you know what you know, and what you don't.",
	"l-diagnose-title": "See what's missing",
	"l-diagnose-text":
		"The concepts we check are compared against what you said. Solid ideas stay, gaps surface — shown as a picture you can read in one glance.",
	"l-relearn-title": "Hear only what you missed",
	"l-relearn-text":
		"A short, spoken lesson covers just the gaps — not the whole chapter. Each pass targets only what didn't land the first time.",
	"l-retest-title": "Prove it stuck",
	"l-retest-text":
		"Freshly worded questions on those same gaps, then a before/after score. You leave with a clear picture of what closed and what's still open.",
	"voice-title": "Voice isn't a feature. It's the mechanism.",
	"voice-1":
		"Explaining something out loud is how the underlying learning technique actually works. There's nowhere to hide off-screen — there's no option, no answer key, just what you can produce. That honesty is the diagnosis.",
	"voice-2":
		"So you speak. Kiftet transcribes, compares what you said against the chapter's concepts, and reads the short lesson back in a calm voice. Talk in, talk out.",
	"tap-speak": "Tap and speak",
	"ring-caption":
		"Says the student. The ring is listening, not judging. What you say out loud is the whole record of what stuck.",
	"rates-title":
		"The system is improving. That's not the same as reaching the student.",
	"rates-text":
		"The national pass rate has climbed every year on record. Each step is real progress — and each one still leaves the overwhelming majority of students outside it. The reform moves at the country's pace. A student's exam doesn't wait.",
	"pass-rate": "national pass rate",
	"pass-rate-best": "best year on record — and still 87 in 100 failed",
	"school-phone-title": "A school phone is enough",
	"school-phone-text":
		"A web app, not an app-store install. Made to run on low bandwidth — and if the voice service drops, you keep going by typing.",
	"night-study-title": "Made for night study",
	"night-study-text":
		"Review happens when the day finally quietens down. The interface stays a calm black room lit by flat ivory, not a bright quiz app.",
	"honest-title": "Honest before/after",
	"honest-text":
		"You see your coverage right after you recall, and again after the lesson closes. If part of it is still open, that answer is as useful as the progress.",
	"byob-label": "Bring your own book",
	"byob-a": "Your textbook ",
	"byob-gold": "is",
	"byob-b": " the study room.",
	"byob-1":
		"Upload the book you're actually studying — the one that matches your syllabus — and Kiftet reads its table of contents and turns each chunk into its own recall → diagnose → relearn → retest loop.",
	"byob-2":
		"The file is read on your device. Only the text is sent, chapter by chapter, so a whole book never becomes one heavy upload — it works on the school's wifi.",
	"preview-on-book": "Preview it on your book",
	"no-pdf":
		"No PDF? Paste the chapter text instead — the loop doesn't care where a chapter begins.",
	chunks: "{n} chunks",
	"study-loop-ready": "Study loop ready",
	"lines-up-next": "lines up next",
	"cta-title": "Pick a chapter. Speak. Close the gap.",
	"cta-text":
		"Pick a chapter, press the ring, and start speaking. The diagnosis comes from your own words.",
	"open-study-room": "Open the study room",
	"footer-text":
		"Closing the gap between what a class covers and what a student keeps. Built for the national exam — one chapter, one voice, one gap at a time.",
	"demo-chip": "Live demo · no account",
	"demo-title": "Feel it for yourself — one round of the loop, right now.",
	"demo-text":
		"Pick the chapter, speak what you remember, and watch Kiftet find what didn't stick — then teach only that, and prove it stayed.",
	"demo-foot":
		"No email, no password, no card. Your demo is private and expires on its own.",
	"demo-setting-up": "Setting up your demo…",
	"demo-start": "Start the live demo →",
	"demo-try": "Try a live demo",
	recalled: "recalled",
	"see-your-chapter": "See it on your own chapter",
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

	// ── Dashboard chrome ─────────────────────────────────────────
	"study-room": "የጥናት ክፍሉ",
	"dash-title": "ምዕራፍ ምረጥ፣ ከዚያም ተናገር።",
	"dash-text":
		"እያንዳንዱ ምዕራፍ ተመሳሳይ ዑደት ያሄዳል — አስታውስ፣ መርምር፣ እንደገና ተማር፣ ድጋሚ ፈትን። ሽፋንህን ከእያንዳንዱ ማስታወስ በኋላ እና በመጨረሻም ታያለህ።",
	"study-by-syllabus": "በስርአተ-ትምህርት ጥናት",
	"add-textbook": "የመማሪያ መጽሐፍህን ጨምር",
	"demo-label": "የቀጥታ ማሳያ",
	"demo-banner": " — ይህ የጥናት ክፍል በመለያ አልተቀመጠም። እድገትህን ለማስቀመጥ መለያ ፍጠር።",
	"create-free-account": "ነፃ መለያ ፍጠር",
	"ai-calls-minute": "በዚህ ደቂቃ የ AI ጥሪዎች:",
	"of-left": "{remaining} ከ {limitPerMinute} ቀርተዋል",
	"budget-out": " — አልቀሩም። ትንሽ ቆይቶ ሞክር።",
	"budget-careful": " — በጥንቃቄ ተጠቀም።",
	"new-textbooks-today": "ዛሬ አዲስ መጽሐፎች:",
	"textbooks-max": "{n} ቢበዛ (ማሳያ)",
	"misconception-map": "ብሔራዊ የስህተት አረዳድ ካርታ",
	"misconception-title": "ተማሪዎች በብዛት የሚሳሳቱት — {subject}",
	"misconception-text":
		"እዚህ ባሉ ተማሪዎች ሁሉ ላይ ማንነት የማይገለጽ ነው። የተሳሳተ አረዳድ የሚታየው {threshold} ወይም ከዚያ በላይ ተማሪዎች ሲደርሱበት ብቻ ነው — ሁልጊዜም የጥቅል ነው፣ የግል ፈጽሞ አይደለም።",
	"unit-of": "· ክፍል {n}",
	"room-unreachable": "የጥናት ክፍሉን መድረስ አልተቻለም",
	"offline-saved": "ከመስመር ውጭ — የተቀመጡ ምዕራፎች",
	"offline-saved-text":
		"ይህ ዝርዝር ከዚህ ስልክ ተጭኗል። አዲስ ሥራ ለመጀመር ግንኙነት ያስፈልጋል — ቀድሞ የተገመገመው ሁሉ ተቀምጦ ይቀራል።",
	"empty-none": "ገና የሚመረመር ነገር የለም።",
	"empty-none-text":
		"የጥናት ክፍሉ ባዶ ነው። ምዕራፎች እንደተጫኑ ወዲያውኑ እዚህ ይታያሉ — ከዚያም ይህ ክፍል የማስታወስ ዑደቱን በእነሱ ላይ ያሄዳል።",
	"add-book-device": "የመማሪያ መጽሐፍህን ጨምር — በመሣሪያህ ላይ ነው፣ በእኛ ላይ አይደለም",
	"opening-ellipsis": "በመከፈት ላይ…",
	"start-review": "ግምገማ ጀምር",
	"card-promise": "ያስታወስከውን ተናገር፣ የጎደለውን ተመልከት፣ ዝጋው።",
	"session-open": "የጥናት ክፍለ-ጊዜ ክፍት ነው",
	resume: "ቀጥል",
	completed: "ተጠናቋል",
	"last-session": "የመጨረሻ ክፍለ-ጊዜ: {delta}",

	// ── Syllabus chrome ──────────────────────────────────────────
	"syllabus-title": "ክፍሎቹ፣ ምዕራፎቹ ብቻ ሳይሆኑ።",
	"syllabus-text":
		"ያሉህን ምዕራፎች ከብሔራዊ ስርአተ-ትምህርት ጋር አስተሳስር፣ ከዚያም የትኞቹ ክፍሎች ጠንካራ እንደሆኑ እና የትኞቹ ገና ክፍተት እንዳላቸው ተመልከት — በአንድ ጊዜ አንድ የጥናት ክፍለ-ጊዜ።",
	"back-dash": "← ዋና ገጽ",
	"syllabus-error": "ስርአተ-ትምህርቱን መጫን አልተቻለም",
	"syllabus-empty":
		"ገና ምንም ስርአተ-ትምህርት አልተዘጋጀም። ባዮሎጂ፣ 12ኛ ክፍል ምሳሌ ከሚቀጥለው የሰርቨር ማሰማራት ጋር ይመጣል።",
	"unit-provisional": "ጊዜያዊ ክፍሎች።",
	"unit-provisional-text":
		"እዚህ ያለው የክፍሎች ዝርዝር በይፋዊው EHEEE ስርአተ-ትምህርት እስኪረጋገጥ ድረስ ጊዜያዊ ነው — መዋቅሩ እውነተኛ ነው፣ ስሞቹ ገና የመጨረሻ አይደሉም።",
	"unit-verified": "የተረጋገጠ።",
	"unit-verified-text": "የክፍሎች ዝርዝር ከ{source} የተጠናቀረ",
	"syllabus-no-units": "ይህ ስርአተ-ትምህርት ገና በሰርቨሩ ላይ ክፍሎች የሉትም።",
	"unassigned-title": "ያልተመደቡ ምዕራፎች",
	"unassigned-text":
		"እነዚህ {subject} ምዕራፎች ገና ከክፍል ጋር አልተገናኙም። ከታች አንዱን መርጠህ አስገባ።",
	"unit-of-label": "ክፍል {n}",
	"chapter-covered": "{covered}/{total} ምዕራፎች ተሸፍነዋል",
	"pct-unit": "{pct}% የዚህ ክፍል",
	"no-chapters-mapped": "ገና ምዕራፎች አልተመደቡም",
	"map-chapter-text":
		"ከታች ካለው ያልተመደበ ዝርዝር ምዕራፍን ወደዚህ ክፍል አስተሳስር፣ ወይም ገብቶ ሲገኝ አጥናው።",
	"not-studied": "ገና አልተጠናም",
	study: "አጥና",
	"map-aria": "ይህን ምዕራፍ ወደ ክፍል አስተሳስር",
	"no-unit": "ክፍል የለም",
	"unit-option": "ክፍል {n} — {title}",
	"unit-moved": "ምዕራፉ ወደዚያ ክፍል ተዛወረ።",
	"unit-unassigned": "ምዕራፉ ከክፍል ውጭ ተደረገ።",

	// ── Textbooks chrome ─────────────────────────────────────────
	"your-textbooks": "የመማሪያ መጽሐፎችህ",
	"byob-title-full": "የራስህን መጽሐፍ አምጣ።",
	"textbooks-text":
		"PDF (እስከ {max} MB) ጫን ወይም ጽሑፍ ገልብጥ። በመሣሪያህ ላይ ይነበባል — ፋይሉ ከስልክህ ፈጽሞ አይወጣም — የመጽሐፉ የይዘት ማውጫም ወደ ክፍሎች ይከፈላል፣ እያንዳንዱም የራሱ የጥናት ዑደት ይሆናል።",
	chunk: "{n} ክፍል",
	"no-chunks": "ገና ክፍሎች የሉም።",
	"reading-device": "መጽሐፍህ በዚህ መሣሪያ ላይ እየተነበበ ነው…",
	"importing-room": "ወደ የጥናት ክፍልህ እየገባ ነው",
	"ready-import": "ለማስገባት ዝግጁ",
	cancel: "ሰርዝ",
	"chunk-progress": "{progress} ከ {total} ክፍሎች",
	"already-in": "ገብቷል",
	"already-here": "አስቀድሞ አለ",
	failed: "አልተሳካም",
	"building-checklist": "ዝርዝር እየተዘጋጀ ነው…",
	"new-label": "አዲስ",
	"import-hint":
		"ክፍሎቹ በአንድ በአንድ ይገባሉ፣ የጨረስካቸው ደግሞ ሄደህ ተመልሰህ ስትመጣ ይዘለላሉ። ደካማ ግንኙነት? አነስተኛ ጽሑፍ ብቻ — ፋይሉ ፈጽሞ አይላክም።",
	"nothing-new": "የሚገባ አዲስ ነገር የለም",
	"retry-failed": "ያልተሳካውን {n} ክፍል እንደገና ሞክር",
	"retry-failed-many": "ያልተሳኩትን {n} ክፍሎች እንደገና ሞክር",
	"import-n": "{n} ክፍል አስገባ",
	"import-n-many": "{n} ክፍሎችን አስገባ",
	"preview-coming": "መቅድም እይታ — ማስገባት በቅርቡ",
	"start-over-import": "እንደገና ጀምር",
	"preview-mode-text":
		"የመቅድም እይታ አገዛዝ: ይህ ክፍፍል በመሣሪያህ ላይ ተከስቷል እና ምንም አልተቀመጠም ወይም ወደ AI አልተላከም። ማስገባቱን ማብራት የሚቀጥለው እርምጃ ነው።",
	"preview-mode": "የመቅድም እይታ አገዛዝ.",
	"preview-mode-note":
		"ከታች ያለውን በመሣሪያው ላይ የሚከፋፈለውን ሞክረህ ማየት ትችላለህ — ምንም አይቀመጥም እና አይላክም። የቀጥታ ማስገባት የሚቀጥለው እርምጃ ነው።",
	"add-textbook-label": "የመማሪያ መጽሐፍ ጨምር",
	"next-book": "የሚቀጥለው የምታጠናው መጽሐፍ የራስህ ሊሆን ይችላል።",
	"book-title": "የመጽሐፍ ርዕስ",
	"grade-example": "ለምሳሌ 9ኛ ክፍል ፊዚክስ",
	"subject-label": "ትምህርት",
	"physics-example": "ለምሳሌ ፊዚክስ",
	"chapter-language": "የምዕራፍ ቋንቋ",
	"lang-en": "እንግሊዝኛ",
	"lang-am": "አማርኛ",
	"lang-om": "አፋን ኦሮሞ",
	"lang-other": "ሌላ",
	"where-content": "ይዘቱ የት ነው?",
	"pdf-file": "PDF ፋይል",
	"paste-text": "ጽሑፍ ገልብጥ",
	"choose-pdf": "PDF ምረጥ",
	"pdf-chosen": "{size} MB — በዚህ መሣሪያ ላይ ይነበባል፣ እስከ {max} MB",
	"pdf-scan-note":
		"PDF እስከ {max} MB። በስካን (ምስል ብቻ) የተገኙ PDF የሚጠና ጽሑፍ የላቸውም — ይልቁንም ጽሑፉን ገልብጥ።",
	"paste-placeholder":
		"የመጽሐፉን ጽሑፍ እዚህ ገልብጥ (በአንድ ጊዜ ጥቂት ክፍሎች)። እንደ \u201CUnit 1\u201D ወይም \u201Cምዕራፍ 2\u201D ያሉ አርዕስቶች ወደ ጥናት ክፍሎች ለአንተ ይከፍሉታል።",
	characters: "{n} ቁምፊዎች",
	"headings-detect":
		"እንደ \u201CUnit 1\u201D ወይም \u201Cምዕራፍ 2\u201D ያሉ የምዕራፍ አርዕስቶች በራሳቸው ይታወቃሉ።",
	"scan-chunks": "ወደ ክፍሎች ቃኝ",
	"plan-confirm": "ማንኛውም ነገር ከመግባቱ በፊት ክፍሎቹን ያረጋግጣሉ።",
	"demo-budget":
		"የማሳያ ክፍሎች በአነስተኛ የዕለት በጀት ይሰራሉ — ዋና ገጽህ ምን እንደቀረ ያሳያል። በሮች ስንከፍት በመለያ የገቡ ተጠቃሚዎች ተጨማሪ ያገኛሉ።",
	"book-on-shelf": "\u201C{title}\u201D በመደርደሪያው ላይ ነው።",
	"chunk-failed": "{n} ክፍል አልደረሰም። ለማጠናቀቅ እንደገና ሞክር።",
	"chunks-failed": "{n} ክፍሎች አልደረሱም። ለማጠናቀቅ እንደገና ሞክር።",
	"nothing-to-import": "የሚገባ ነገር የለም — ጽሑፉ ባዶ ይመስላል።",

	// ── Voice-test harness ───────────────────────────────────────
	"vt-nothing": "እዚህ የሚታይ ነገር የለም",
	"vt-nothing-text": "የጥናት ክፍሉ በምዕራፎቹ ውስጥ ነው የሚኖረው፣ በፈተና መቆሚያ ውስጥ አይደለም።",
	"go-to-chapters": "ወደ ምዕራፎችህ ሂድ",
	"voice-test": "የድምጽ ፈተና",
	loading: "በመጫን ላይ…",
	"voxide-key-missing": "የ Voxide ቁልፍ የለም",
	transcript: "ግልባጭ",
	"nothing-yet": "ገና ምንም የለም — አንድ ነገር ተናገር…",
	"you-label": "አንተ",
	"kiftet-label": "Kiftet",
	"vt-idle": "ቀለበቱን ንካና ተናገር — ማንኛውንም ነገር።",
	"vt-armed": "ዝግጁ።",
	"vt-connecting": "ከድምጽ ወኪሉ ጋር በመገናኘት ላይ…",
	"vt-listening": "በማዳመጥ ላይ… ለማቆም ቀለበቱን እንደገና ንካ።",
	"vt-thinking": "በማሰብ ላይ… ለመሰረዝ ቀለበቱን እንደገና ንካ።",
	"vt-speaking": "በመናገር ላይ… ለማቋረጥ ቀለበቱን እንደገና ንካ።",
	"vt-executing": "ድርጊቱን በማስኬድ ላይ… ለመሰረዝ ቀለበቱን እንደገና ንካ።",
	"vt-error": "አንድ ነገር ተሳስቷል። ለመድገም ንካ።",

	// ── Home / landing page ──────────────────────────────────────
	"hero-eyebrow": "ኪፍተት · ለኢትዮጵያ ተማሪዎች በድምጽ የሚደረግ የትምህርት ግምገማ",
	"hero-gap": "ክፍተቱን ዝጋ።",
	"hero-87":
		"ከ100 ተማሪዎች 87ቱ በብሔራዊ ፈተና ይወድቃሉ። የበለጠ መጣር መልሱ አይደለም — የትኞቹ ክፍተቶች የአንተ እንደሆኑ ማወቅ ነው።",
	"hero-sub":
		"ኪፍተት ጮክ ብለህ የምታስታውሰውን ያዳምጣል፣ ያልተረጋገጡትን ሀሳቦች ያገኛል፣ እነዚያን ብቻ በአጭር የድምጽ ትምህርት ያስተምራል — ከዚያም የተረጋገጠውን እንደገና ይፈትናል። ሌላ የጥያቄ ባንክ አይደለም። ምርመራ ነው።",
	"start-closing": "ክፍተቶችህን መዝጋት ጀምር",
	"how-loop-works": "ስርዓቱ እንዴት እንደሚሰራ",
	"no-account": "መለያ የለህም?",
	"demo-jump": "ወደ የቀጥታ ማሳያው በቀጥታ ሂድ",
	"stat-87a":
		"የ2026 ብሔራዊ ፈተናን ከተፈተኑት {count} ተማሪዎች ውስጥ አሁንም በስርዓቱ ወድቀዋል — አገሪቱ በመዘገበችው ምርጥ ውጤትም ቢሆን።",
	"stat-87b": "{schools} ትምህርት ቤቶች ውስጥ አንድም ተማሪ አላለፈም።",
	"stat-absent":
		"ተማሪዎቹ አልቀሩም። ትምህርታቸውን ተከታትለዋል። የጎደለው የትምህርት አጋጣሚ አይደለም — ከፈተናው በፊት የትኞቹ ሀሳቦች እንዳልተረጋገጡ ማወቅ ነው።",
	"loop-title": "አራት እርምጃዎች። አንድ ዑደት። ክፍተቶቹ ብቻ።",
	"loop-sub":
		"ቅደም ተከተሉ ሙሉው ምርት ነው — አስታውስ፣ መርምር፣ እንደገና ተማር፣ ድጋሚ ፈትን። ከእሱ ውጭ በኪፍተት ውስጥ ምንም የለም።",
	"l-speak-title": "ያስታወስከውን ተናገር",
	"l-speak-text":
		"ምዕራፍ ምረጥና ጮክ ብለህ አስረዳ፣ ያለ ማስታወሻ፣ ያለ ፍንጭ። መናገር ግልጽነትን ያስገድዳል — የምታውቀውን እና የማታውቀውን ታያለህ።",
	"l-diagnose-title": "የጎደለውን ተመልከት",
	"l-diagnose-text":
		"የምንፈትሻቸው ሀሳቦች ከተናገርከው ጋር ይነጻጸራሉ። የተረጋገጡት ይቀራሉ፣ ክፍተቶቹም ይታያሉ — በአንድ እይታ የሚነበብ ምስል።",
	"l-relearn-title": "ያመለጠህን ብቻ ስማ",
	"l-relearn-text":
		"አጭር የድምጽ ትምህርት ክፍተቶቹን ብቻ ይሸፍናል — ሙሉውን ምዕራፍ አይደለም። እያንዳንዱ ዙር በመጀመሪያ ጊዜ ያልተረጋገጠውን ብቻ ያነጣጥራል።",
	"l-retest-title": "የተረጋገጠ መሆኑን አስረግጥ",
	"l-retest-text":
		"በእነዚያው ክፍተቶች ላይ በአዲስ አነጋገር የተፈጠሩ ጥያቄዎች፣ ከዚያም የበፊት/የበኋላ ውጤት። ምን እንደተዘጋ እና ምን አሁንም ክፍት እንደሆነ በግልጽ ተመልከተህ ትወጣለህ።",
	"voice-title": "ድምጽ ባህሪ አይደለም። ዘዴው ነው።",
	"voice-1":
		"የትምህርት ዘዴው በተጨባጭ የሚሰራው ጮክ ብለህ በማስረዳት ነው። ከስክሪኑ ውጭ የምትደበቅበት ቦታ የለም — አማራጭ የለም፣ የመልስ ቁልፍ የለም፣ የምትፈጥረው ብቻ ነው። ያ እውነተኝነት ምርመራው ነው።",
	"voice-2":
		"ስለዚህ ትናገራለህ። ኪፍተት ቃላቶችህን ይመዘግባል፣ የተናገርከውን ከምዕራፉ ሀሳቦች ጋር ያነጻጽራል፣ አጭሩን ትምህርት ደግሞ በረጋ ድምጽ ያነባል። በድምጽ ግባ፣ በድምጽ ውጣ።",
	"tap-speak": "ንካና ተናገር",
	"ring-caption":
		"ተማሪው ይላል። ቀለበቱ እያዳመጠ ነው፣ እየፈረደ አይደለም። ጮክ ብለህ የተናገርከው የተረጋገጠው ሙሉ መዝገብ ነው።",
	"rates-title": "ስርዓቱ እየተሻሻለ ነው። ተማሪውን ከመድረስ ግን የተለያየ ነገር ነው።",
	"rates-text":
		"በመዝገቡ ላይ የብሔራዊ ማለፊያ መጠን በየዓመቱ ከፍ ብሏል። እያንዳንዱ እርምጃ እውነተኛ እድገት ነው — እያንዳንዱም አሁንም አብዛኞቹን ተማሪዎች ከእሱ ውጭ ይተዋል። ለውጡ በአገሪቱ ፍጥነት ይንቀሳቀሳል። የተማሪ ፈተና ግን አይጠብቅም።",
	"pass-rate": "ብሔራዊ ማለፊያ መጠን",
	"pass-rate-best": "በመዝገቡ ምርጥ ዓመት — አሁንም ከ100 87ዎቹ ወድቀዋል",
	"school-phone-title": "የትምህርት ቤት ስልክ በቂ ነው",
	"school-phone-text":
		"የድር መተግበሪያ ነው፣ ከመተግበሪያ መደብር የሚወርድ አይደለም። በደካማ ኢንተርኔት እንዲሰራ ተሰርቷል — የድምጽ አገልግሎቱ ቢወድቅም በመጻፍ ትቀጥላለህ።",
	"night-study-title": "ለማታ ጥናት የተዘጋጀ",
	"night-study-text":
		"ግምገማው ቀኑ በመጨረሻ ሲረጋ ነው የሚደረገው። በይነገጹ በጸጥታዊ የዝሆን ጥርስ ብርሃን የበራ ረጋ ያለ ጥቁር ክፍል ነው፣ ደማቅ የፈተና መተግበሪያ አይደለም።",
	"honest-title": "እውነተኛ በፊት/በኋላ",
	"honest-text":
		"ካስታወስክ በኋላ ወዲያውኑ ሽፋንህን ታያለህ፣ ትምህርቱ ከተዘጋ በኋላም እንደገና። የተወሰነው አሁንም ክፍት ከሆነ፣ ያ መልስ ልክ እንደ እድገቱ ጠቃሚ ነው።",
	"byob-label": "የራስህን መጽሐፍ አምጣ",
	"byob-a": "የመማሪያ መጽሐፍህ ",
	"byob-gold": "ነው",
	"byob-b": " የጥናት ክፍሉ።",
	"byob-1":
		"በትክክል የምታጠናውን መጽሐፍ ጫን — ከስርአተ-ትምህርትህ ጋር የሚስማማውን — ኪፍተት የይዘቱን ማውጫ ያነባል እና እያንዳንዱን ክፍል የራሱ አስታውስ → መርምር → እንደገና ተማር → ድጋሚ ፈትን ዑደት ያደርገዋል።",
	"byob-2":
		"ፋይሉ በመሣሪያህ ላይ ይነበባል። ጽሑፉ ብቻ ነው የሚላከው፣ ምዕራፍ በምዕራፍ — ስለዚህ ሙሉ መጽሐፍ በአንድ ጊዜ ከባድ አፕሎድ አይሆንም። በትምህርት ቤት ኢንተርኔትም ይሰራል።",
	"preview-on-book": "በመጽሐፍህ ላይ ሞከረህ ተመልከት",
	"no-pdf": "PDF የለህም? ይልቁንም የምዕራፉን ጽሑፍ ገልብጥ — ዑደቱ ምዕራፍ ከየት እንደሚጀመር አይጨነቅም።",
	chunks: "{n} ክፍሎች",
	"study-loop-ready": "የጥናት ዑደት ዝግጁ",
	"lines-up-next": "ቀጥሎ ይሰለፋል",
	"cta-title": "ምዕራፍ ምረጥ። ተናገር። ክፍተቱን ዝጋ።",
	"cta-text": "ምዕራፍ ምረጥ፣ ቀለበቱን ተጫን፣ መናገር ጀምር። ምርመራው የሚመጣው ከራስህ ቃላት ነው።",
	"open-study-room": "የጥናት ክፍሉን ክፈት",
	"footer-text":
		"ክፍል የሚሸፍነውን እና ተማሪ የሚይዘውን መካከል ያለውን ክፍተት በመዝጋት። ለብሔራዊ ፈተና የተሰራ — በአንድ ጊዜ አንድ ምዕራፍ፣ አንድ ድምጽ፣ አንድ ክፍተት።",
	"demo-chip": "የቀጥታ ማሳያ · ያለ መለያ",
	"demo-title": "በራስህ ተማክር — አንድ ዙር የዑደቱን፣ አሁኑኑ።",
	"demo-text":
		"ምዕራፉን ምረጥ፣ ያስታወስከውን ተናገር፣ ኪፍተት ያልተረጋገጠውን ሲያገኝ ተመልከት — ከዚያም ያንን ብቻ ያስተምራል፣ የተረጋገጠ መሆኑንም ያረጋግጣል።",
	"demo-foot": "ኢሜይል የለም፣ የይለፍ ቃል የለም፣ ካርድ የለም። ማሳያህ የግል ነው እና በራሱ ያበቃል።",
	"demo-setting-up": "ማሳያህ እየተዘጋጀ ነው…",
	"demo-start": "የቀጥታ ማሳያ ጀምር →",
	"demo-try": "የቀጥታ ማሳያ ሞክር",
	recalled: "አስታውሷል",
	"see-your-chapter": "በራስህ ምዕራፍ ላይ ተመልከት",
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
