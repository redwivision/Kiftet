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
  "gaps-estimated":
    "Heavily used right now, so this grade is a quick estimate from what it could hear, not a full check. Study the open ones, then test yourself again.",
  "lesson-title": "The short version",
  "lesson-text":
    "Just what you missed — nothing more. Read it now, or hear it spoken back to you.",
  // Guide (phase 11, 3b). The study order itself is the message: wrong first,
  // because that is the one thing re-reading does not fix.
  "guide-start-here": "Start here",
  "guide-wrong-first": "You had this one backwards",
  "guide-almost-first": "So close — one sentence from you",
  "guide-almost-title": "You raised it. Now finish it.",
  "guide-almost-body":
    "You brought these up but did not quite land them. They are the cheapest wins on this page — say each one back in your own words and they are done.",
  "guide-not-yet": "Not yet touched",
  "guide-already-have": "Already yours",
  "guide-already-body":
    "You got these right. Skim them, don’t read them twice.",
  "guide-why": "Why it matters",
  "guide-recall": "Say it back",
  "guide-in-your-book": "In your book",
  "guide-estimated-note":
    "Some sections are a quick summary from the text itself, not a written lesson. The ideas are real; the wording is ours.",
  "guide-empty":
    "Nothing needs work here — every idea in this section is solid. Recap out loud, then move on.",
  "guide-section-count": "{count} to work through",
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

  // ── Generated-content notices + fluency (bet 4, slice C) ────
  "retest-restored": "Your retest progress was restored.",
  "lesson-cached-same":
    "This lesson was saved on this phone from earlier — it covers the same gaps.",
  "lesson-cached-changed":
    "This lesson was saved on this phone from an earlier pass — your gaps have changed a little since.",
  "lesson-cached-lang":
    "This lesson was saved on this phone from earlier in {lang} — it still covers the same gaps, but was written before you switched languages.",
  "questions-cached":
    "These questions were saved on this phone from earlier — your answers still get graded once you're back online.",
  "questions-cached-lang":
    "These questions were saved on this phone from earlier in {lang} — your answers still get graded once you're back online.",
  "fluency-am": "In Amharic",

  // ── Study loop chrome (phase 10) ────────────────────────────
  submit: "Submit",
  "type-your-answer": "Type your answer…",
  "type-answer-out-loud": "Type your answer out loud in your own words…",
  "recall-aria":
    "Type how much of the chapter you remember — this is graded exactly like a spoken recall",
  "voice-service-busy":
    "The voice service is out of sessions right now — the typed version still works.",
  "what-you-said": "What you said",
  "read-it-back": "Read it back",
  "try-voice-instead": "Try voice instead",
  "prefer-typing": "Prefer typing?",
  "gap-closed": "gap closed",
  "gap-covered": "gap covered",
  "all-solid": "all solid",
  "another-pass": "another pass",
  "previously-answered": "Previously answered retest question",
  "voice-still-listening": "Still listening — take your time.",
  "voice-catch-none":
    "I didn't catch any words yet — tap the ring or type whenever you're ready.",
  "voice-catch-deferred":
    "I didn't catch that — no rush. Tap the ring and try again whenever you're ready.",

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
  "budget-out": " — all used. Wait a moment and try again.",
  "budget-out-in": " — all used. Back in {time}.",
  "budget-careful": " — nearly used up.",
  "new-textbooks-today": "New textbooks today:",
  "textbooks-max": "{n} max (demo)",
  "textbooks-used-of": "{used} of {n} used",
  "textbooks-unlimited": "{used} added, no daily limit",
  "textbooks-reset-at":
    " — that's today's limit. New books allowed from {time}.",
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
  "unit-periods": "{n} periods in the syllabus",
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
    "Save a textbook and its contents to your account, then choose the chapters you want to study. PDFs stay on this device; only selected chapter text is sent for processing.",
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
    "Your textbook and contents stay in your account. The PDF stays on this device; if you open the book elsewhere, choose its PDF again to import more chapters.",
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
  "textbook-contents": "Your table of contents",
  "choose-from-toc": "Choose chapters to add to your study library",
  "select-available": "Select available",
  "clear-selection": "Clear selection",
  "select-chapter": "Select {title}",
  // The two readings of one book. The checklist is the whole book at a glance;
  // the contents is the book's own numbering, kept as the book writes it.
  "toc-view-label": "How to read the contents",
  "toc-tab-checklist": "Checklist",
  "toc-tab-checklist-hint": "Every unit on one screen, with what is inside it.",
  "toc-tab-contents": "Contents",
  "toc-tab-contents-hint":
    "The book's own numbering — Unit 2, then 2.1, then 2.1.1.",
  "toc-tree-label": "Table of contents",
  "toc-nothing-picked": "{total} entries in this book. Tick what you want.",
  "toc-picked-summary": "{picked} of {total} entries picked",
  "toc-inside": "{n} inside",
  "toc-no-topics": "No topics listed under this unit",
  "toc-expand-all": "Expand all",
  "toc-collapse-all": "Collapse all",
  "toc-expand": "Expand {title}",
  "toc-collapse": "Collapse {title}",
  "toc-empty": "No contents were found in this book.",
  "hierarchy-report-label": "What we read from this book",
  "hierarchy-report-source": "Read from",
  "hierarchy-report-contents": "Contents page",
  "hierarchy-report-contents-missing": "not found",
  "hierarchy-report-pages": "pages read",
  "hierarchy-report-offset": "Page offset",
  "hierarchy-report-none": "not established",
  "hierarchy-report-entries": "Entries / units",
  "hierarchy-report-copy": "Copy this reading",
  "hierarchy-report-copied": "Copied",
  "saved-book-device-note":
    "The textbook and its contents are saved to your account. The PDF stays on this device; selected chapter text is sent for study processing.",
  "save-textbook": "Save textbook",
  "textbook-saved": "Textbook and contents saved.",
  "textbook-saved-local-error":
    "The textbook was saved to your account, but its PDF could not be kept on this device. Choose the PDF again next time you import.",
  "reselect-textbook-source":
    "This device no longer has the source file. Choose the original PDF again to continue.",
  "reselect-textbook-text":
    "This device no longer has the pasted text. Paste the original text again to import more chapters.",
  "textbook-file-mismatch":
    "This file does not match the saved textbook source. Choose the original PDF to avoid importing the wrong chapters.",
  "textbook-source-conflict":
    "This title already belongs to a different textbook source with imported chapters. Use a new title to keep both books separate.",
  "saved-toc-chapters": "{n} chapters in its contents",
  "view-book-contents": "View table of contents · {n} chapters",
  "imported-chapters": "{n} chapters imported",
  "no-chapters-imported": "No chapters imported yet.",
  "study-section": "Study section {n} of {total}",
  "chapter-section": "Section {n}",
  "choose-chapters": "Choose chapters",
  "select-to-import": "Choose chapters to import",
  "chapter-progress": "{progress} of {total} chapters",
  "import-chapter-n": "Import {n} chapter",
  "import-chapters-n": "Import {n} chapters",
  "import-entry-n": "Import {n} entry",
  "import-entries-n": "Import {n} entries",
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
    "PDFs up to {max} MB. Scanned pages are read on this device; select a chapter to recognize it when you import.",
  "paste-placeholder":
    "Paste the book's text here (a few chapters' worth at a time). Headings like \u201CUnit 1\u201D or \u201Cምዕራፍ 2\u201D are used to find chapters.",
  characters: "{n} characters",
  "headings-detect":
    "Chapter headings like \u201CUnit 1\u201D or \u201Cምዕራፍ 2\u201D are detected automatically.",
  "scan-chunks": "Read the table of contents",
  "plan-confirm":
    "Review the book's contents, then save the textbook before importing chapters.",
  "demo-budget":
    "This room runs on a small request budget — your dashboard shows exactly what's left and when it refills. Signing in raises the limit and removes the daily book cap.",
  "book-on-shelf": "\u201C{title}\u201D is on the shelf.",
  "chunk-failed": "{n} chunk didn't land. Retry to finish.",
  "chunks-failed": "{n} chunks didn't land. Retry to finish.",
  "nothing-to-import": "Nothing to import — the text looks empty.",

  // PDF that opens but whose text is not really there. Three cases, three
  // messages, because the fix differs: paste for the first two, and a
  // different file for a book that is simply not text at all.
  "pdf-no-text":
    "This PDF has no text we can read. It is probably scanned pages, or photos of a book. Paste the chapter text instead and the study loop works the same.",
  "pdf-too-thin":
    "Only {n} characters of this PDF could be read — too little to study. Its fonts are probably not readable, or it is scanned pages. Paste the chapter text instead.",
  "pdf-header-only":
    "This PDF opens, but its words will not come out. All we could read were page headers, which means the pages themselves are images or use fonts this browser cannot read. Paste the chapter text instead and the study loop works the same.",

  // A book whose words will not come out is not a dead end any more: the
  // chapter list is still found from the readable headings, and each chapter's
  // body is read from the page image on this device when you import it.
  "ocr-notice":
    "This book's words do not come out of the file, so we will read them from the page image — on this device, exactly as the file is never uploaded. Each chapter takes about two minutes the first time, and only once.",
  "ocr-reading-page": "Reading page {done} of {total}…",
  "ocr-read-chapter": "Reading this chapter from the page image",
  "ocr-unavailable":
    "This device could not start the on-device reader. Paste the chapter text instead and the study loop works the same.",
  "ocr-read-nothing":
    "We could not read any words from these pages, so there is nothing to study here. Try a different chapter, or paste the text.",

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

  // What the voice agent says when it has nothing better to offer: the page
  // drives the loop and it only reads things back. Read to the student, so it
  // has to be in their language.
  "voice-agent-greeting":
    "The study loop on screen — the recall, the diagnosis, the short version, the retest — is driven by the page, and I help by reading things back in a natural voice. Recite the chapter out loud or answer the question on screen, and when you're finished just tell me and I'll close the session.",
  "voice-agent-done": "I'm done for now",
  "voice-agent-close": "Close the session",
  "voice-agent-dashboard": "Take me back to the dashboard",

  // ── Home / landing page ──────────────────────────────────────
  "hero-eyebrow": "Kiftet · spoken study review for Ethiopian students",
  "diag-eyebrow": "What it actually sees",
  "diag-title": "Not a score. A list of exactly what to fix.",
  "diag-sub":
    "You speak for a minute about a chapter. Kiftet checks each idea on the syllabus against what you actually said — and marks the difference between not raising something and raising it badly. That difference is the whole product.",
  "diag-unit": "Biology 12 · Plant physiology",
  "diag-one-minute": "1 minute of speech",
  "diag-l3": "3 — you can answer this",
  "diag-l1": "1 — you raised it, but didn't say what it means",
  "diag-l2": "2 — you said it the wrong way",
  "diag-l0": "0 — not raised yet",
  "diag-t3": "It landed. Leave it alone and spend your night somewhere else.",
  "diag-t1":
    "This is the good news hiding in plain sight. You remember it exists; one clear sentence finishes it.",
  "diag-t2":
    "Re-reading will not fix this one. It has to be unlearned and put back the right way.",
  "diag-t0":
    "Fair enough — nobody covers everything. This is what the short version is for.",
  "diag-punchline":
    "Two of those need one sentence from you. One needs correcting, not re-reading. That's a very different night from “revise the whole chapter” — and it's the difference between 6 weeks of hoping and 6 days of knowing.",
  "demo-c-1": "Photosynthesis",
  "demo-c-2": "Chlorophyll and absorbed light",
  "demo-c-3": "Respiration and photosynthesis",
  "demo-c-4": "Water as a reactant in photosynthesis",
  "demo-c-5": "Factors limiting the rate",
  "demo-card-unit": "Biology 12 · Cell biology",
  "demo-card-chapter": "The cell and its organelles",
  "demo-card-c-1": "Cell theory",
  "demo-card-c-2": "Mitochondria and ATP",
  "demo-card-c-3": "Nucleus and control of the cell",
  "demo-card-c-4": "Ribosomes and protein synthesis",
  "demo-card-c-5": "How organelles stay in their compartments",
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

  // ── Launch waitlist ────────────────────────────────────────
  // The reward is stated up front, with the two things a person has to do
  // spelled out. Burying "tell us what you found" in a later step is how a
  // promotion turns into people feeling trapped after the fact.
  "waitlist-chip": "Launch waitlist",
  "waitlist-title": "Be first in when Kiftet launches",
  "waitlist-text":
    "Leave your number and we'll tell you the moment Kiftet goes live. Nothing else — no other mail.",
  "waitlist-reward":
    "Join our Telegram channel and send us one line about what you found, and you get {n} month of premium on launch day.",
  "waitlist-name": "Your name",
  "waitlist-phone": "Mobile number",
  "waitlist-phone-hint": "For example 0911 234 567",
  "waitlist-consent":
    "Kiftet may store this number to contact me when it launches. I can ask for it to be deleted at any time.",
  "waitlist-cta": "Join the waitlist",
  "waitlist-joining": "Saving your place…",
  "waitlist-joined": "You're on the list",
  "waitlist-wave": "Wave {wave} · you're in",
  "waitlist-closed":
    "The waitlist is full right now. Join the channel and we'll tell you when it reopens.",
  "waitlist-network":
    "We couldn't reach the server. Check your connection and try again — your number won't be counted twice.",
  "waitlist-invalid-phone": "Enter a mobile number, like 0911 234 567.",
  "waitlist-open-telegram": "Connect Telegram",
  "waitlist-open-channel": "Open the channel",
  "waitlist-step-channel": "1. Join our Telegram channel",
  "waitlist-step-verify": "2. Send /joined in the channel",
  "waitlist-step-testimonial": "3. Send us one line",
  "waitlist-verify-hint":
    "We confirm the join from Telegram, so send /joined in the channel once you're in — then this ticks itself.",
  "waitlist-step-done":
    "All three done — your premium month is locked in for launch day.",
  "waitlist-check": "Check my place",
  "waitlist-privacy": "How we use your number",

  // ── Coverage view (the flagship gap visualization) ───────────
  "cov-checked": "of the concepts we checked came out solid",
  "cov-solid": "solid",
  "cov-gap": "gap",
  "cov-wrong": "stated wrong",
  "cov-aria": "{covered} of {total} concepts covered, {missing} still gaps",
  "cov-aria-wrong": ", {n} stated incorrectly",
  "cov-aria-almost": ", {n} raised but not explained",
  "cov-importance": "importance {n}/5",
  "cov-legend-sage": "solid",
  "cov-legend-gold": "nearly",
  "cov-legend-rust": "wrong",
  "cov-legend-open": "not raised",
  "cov-already-solid": "Already solid",
  "cov-needs-work": "Needs work",
  "cov-none-yet": "Nothing landed yet — that's the starting point.",
  "cov-all-solid": "Nothing. Every concept we checked is solid.",
  "cov-almost-title": "So close — you raised it",
  "cov-almost-text":
    "You brought these up, but stopped before saying what they mean or why. One clear sentence each is usually the whole thing — start here and the payoff is fastest.",
  "cov-wrong-title": "Watch out — stated wrong",
  "cov-wrong-text":
    "These aren't ideas you skipped; you said them the wrong way. The short lesson will fix them first.",

  // ── Chrome + failure states ─────────────────────────────────
  "nav-primary": "Main",
  "skip-to-content": "Skip to content",
  "go-home": "Back to the start",
  "err-404-title": "This page isn't here.",
  "err-404-body":
    "The link may be old, or the page may have moved. Nothing you saved is gone.",
  "err-500-title": "Something broke on our side.",
  "err-500-body":
    "This isn't your fault, and nothing you saved is lost. Try again, or head back to the study room.",
  "err-offline-title": "No connection.",
  "err-offline-body":
    "Kiftet couldn't reach the network. Anything saved on this phone is still here.",
  "technical-details": "Technical details",
  "close-details": "Hide details",
  "sign-in": "Sign In",
  "auth-welcome-back": "Welcome back",
  "auth-signin-subtitle":
    "Sign in to keep closing the gaps the exam will look for.",
  "auth-signin-cta": "Sign in",
  "auth-signin-error": "Unable to sign in right now. Try again.",
  "auth-open-room": "Open your study room",
  "auth-signup-subtitle":
    "One account, every chapter. Your first recall takes two minutes.",
  "auth-signup-cta": "Create account",
  "auth-account-created": "Account created",
  "auth-name-label": "Name",
  "auth-email-label": "Email",
  "auth-password-label": "Password",
  "auth-invalid-email": "Invalid email address",
  "auth-password-too-short": "Password must be at least 8 characters",
  "auth-check-email-title": "Check your email",
  "auth-check-email-body":
    "We sent a link to {email}. Open it to finish setting up your account.",
  "auth-forgot-password": "Forgot your password?",
  "auth-forgot-title": "Reset your password",
  "auth-forgot-subtitle":
    "Tell us your email and we'll send you a link to set a new one.",
  "auth-forgot-cta": "Send reset link",
  "auth-or-continue-with": "or continue with",
  "auth-continue-with": "Continue with {provider}",
  "auth-forgot-sent":
    "If that address has an account, a reset link is on its way.",
  "auth-forgot-invalid-email": "Enter the email you signed up with",
  "auth-forgot-back": "Back to sign in",
  "auth-reset-title": "Choose a new password",
  "auth-reset-subtitle": "Pick something you haven't used here before.",
  "auth-reset-cta": "Set new password",
  "auth-reset-done": "Password updated. You can sign in with it now.",
  "auth-reset-no-token":
    "This reset link is incomplete. Ask for a new one from the sign-in page.",
  "auth-reset-failed": "That link has expired or already been used.",
  "auth-new-password-label": "New password",
  // The study ring pushes to talk, so its captions can't reuse the `vt-*`
  // strings: those describe an always-on agent that you interrupt, this one
  // describes a held recording that you finish. Same states, other verbs.
  "st-recall-idle":
    "Tap the ring, then say what you remember about this chapter out loud. No notes — rough and honest is perfect. Tap again when you're done.",
  "st-answer-idle":
    "Say your answer out loud in your own words — teaching it back is what proves it. Tap the ring when you're done.",
  "st-armed": "Ready — tap to start.",
  "st-connecting": "Connecting…",
  "st-listening": "Listening… tap the ring when you're done.",
  "st-thinking": "Thinking…",
  "st-speaking": "Speaking…",
  "st-executing": "Working…",
  "st-error": "Couldn't reach the voice service. Tap to retry, or type below.",
  "my-account": "My Account",
  "sign-out": "Sign Out",
  "need-account": "Need an account?",
  "have-account": "Already have an account?",
  "sign-up": "Sign up",
  "ink-for-the-room": "Ink for the room",
  "auth-eyebrow": "Close the gap",
  "auth-promise":
    "Speak a chapter out loud, see exactly which ideas didn't land.",
  "auth-quote": "Say what you remember. The gaps do the rest.",
  "auth-foot": "Nobody starts from zero.",
  "choose-theme": "Choose a theme",
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
  "gaps-estimated":
    "አሁን በከባይ ጥቅበት ላይ ነው፤ ስለዚህ ይህ ውጤት ከሰማት ብቻ የተዘጋጀ ፈጣን ግምት ነው፤ ሙሉ ምርመራ አይደለም። ክፍት የሆኑትን ተማር፣ ከዚያ ስራህን እንደገና ሞክር።",
  "lesson-title": "አጭሩ ማብራሪያ",
  "lesson-text": "ያመለጠህን ብቻ — ከዚያ ያለፈ ምንም። አሁን አንብበው፣ ወይም ተናግሮ ስማው።",
  "guide-start-here": "እዚህ ይጀምር",
  "guide-wrong-first": "ይህን ተናሽተዋል",
  "guide-almost-first": "በጣም ቅርብ — አንድ ምርስ ከእርስህ",
  "guide-almost-title": "አስተያዩ። አሁን ያጠናቅቅ።",
  "guide-almost-body":
    "እነዚህን ጠቅስተህ፣ ግን በተስተካከለ አልጠናቀቅም። በዚህ ገጽ ላይ በጭማሪ የሆኑ ትሩር ናቸው — እያንዳንዱን በራስህ ቃላት አስተናግሮ ጨርስተዋል።",
  "guide-not-yet": "ገና አልተነካም",
  "guide-already-have": "የእርስህ ነው",
  "guide-already-body": "እነዚህን በትክክል መልሰኝ። አንብብ ሳይሁሉ አጭሩ።",
  "guide-why": "ለምን አስፈላጊ ነው",
  "guide-recall": "በራስህ ቃል ግለጽ",
  "guide-in-your-book": "በመጽሐፍህ ውስጥ",
  "guide-estimated-note":
    "ከዚህ ቅርጾች ከጽሑቱ በራስዎች የተዘጋጁ አጭር ማጠቃለያዎች ናቸው — የተጻፈባቸው ትምህርት አይደለም። ሃሳቦቹ እውነታዊ ናቸው፤ ቃላቱ የእኛ ናቸው።",
  "guide-empty":
    "እዚህ ምንም ለመስራት የለም — በዚህ ክፍል ውስጥ ያሉት ሁሉም ሃሳቦች ጠንካራ ናቸው። በአፍ በአፍ አስታውስ፣ ከዚያም ቀጥል።",
  "guide-section-count": "{count} ለመስራት",
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

  // ── Generated-content notices + fluency (bet 4, slice C) ────
  "retest-restored": "የድጋሚ ፈተና እድገትህ ተመልሷል።",
  "lesson-cached-same": "ይህ ትምህርት ከዚህ ቀደም በዚህ ስልክ ተቀምጧል — ተመሳሳይ ክፍተቶችን ይሸፍናል።",
  "lesson-cached-changed":
    "ይህ ትምህርት ከዚህ ቀደም በዚህ ስልክ ተቀምጧል — ክፍተቶችህ ትንሽ ተቀይረዋል።",
  "lesson-cached-lang":
    "ይህ ትምህርት ከዚህ ቀደም በ{lang} በዚህ ስልክ ተቀምጧል — ተመሳሳይ ክፍተቶችን ይሸፍናል፣ ነገር ግን ከቋንቋው በመቀየር ቀድሞ ተጽፏል።",
  "questions-cached":
    "እነዚህ ጥያቄዎች ከዚህ ቀደም በዚህ ስልክ ተቀምጠዋል — መልሶችህ እንደገና ሲገናኝ አሁንም ይመዘገባሉ።",
  "questions-cached-lang":
    "እነዚህ ጥያቄዎች ከዚህ ቀደም በ{lang} በዚህ ስልክ ተቀምጠዋል — መልሶችህ እንደገና ሲገናኝ አሁንም ይመዘገባሉ።",
  "fluency-am": "በአማርኛ",

  // ── Study loop chrome (phase 10) ────────────────────────────
  submit: "አስገባ",
  "type-your-answer": "መልስህን ጻፍ…",
  "type-answer-out-loud": "መልስህን በራስህ ቃላት ጮክ ብለህ ጻፍ…",
  "recall-aria": "ያስታወስከውን ምዕራፍ ጻፉ — ይህ በአንደበት እንደተናገርክ በትክክል ይመዘገባል።",
  "voice-service-busy": "የድምጽ አገልግሎቱ አሁን ሙሉ ነው — የፅሁፍ መግለጫ አሁንም ይሰራል።",
  "what-you-said": "የተናገርከው",
  "read-it-back": "እንደገና አንብብ",
  "try-voice-instead": "በድምጽ ሞክር",
  "prefer-typing": "በፅሁፍ መሞከርን ትመርጣለህ?",
  "gap-closed": "ክፍተቱ ተዘግቷል",
  "gap-covered": "ክፍተቱ ተሸፍኗል",
  "all-solid": "ሁሉም ጠንካራ",
  "another-pass": "ሌላ ሙከራ",
  "previously-answered": "ቀድሞ የተመለሰ የድጋሚ ፈተና ጥያቄ",
  "voice-still-listening": "አሁንም እያዳመጥኩ ነው — ጊዜ ውሰድ።",
  "voice-catch-none": "ገና ቃላት አልያዝኩም — ሲዘጋጁ ቀለበቱን ንካ ወይም ጻፍ።",
  "voice-catch-deferred": "ያንን አልያዝኩም — አትቸኩል። ቀለበቱን ንካ፣ ሲዘጋጁ እንደገና ሞክር።",

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
  "budget-out": " — ሁሉም ተጠቅመዋል። ትንሽ ጠብቅተን እና እንደገና ሞክር።",
  "budget-out-in": " — ሁሉም ተጠቅመዋል። በ {time} ይመለሳል።",
  "budget-careful": " — በቅርብ ተሟልቷል።",
  "new-textbooks-today": "ዛሬ አዲስ መጽሐፎች:",
  "textbooks-max": "{n} ቢበዛ (ማሳያ)",
  "textbooks-used-of": "ከ {n} ውስጥ {used} ተጠቅመዋል",
  "textbooks-unlimited": "{used} ተጨምረዋል፣ የቀኑ ገደብ የለም",
  "textbooks-reset-at": " — የዛሬን ገደብ አስተልቋል። ከ {time} ጀምሮ አዲስ መጽሐፎች ይችላሉ።",
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
  "unit-periods": "{n} የክፍል ሰዓት በሳርባስ ውስጥ",
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
    "የመጽሐፍህን ይዘት በመለያህ ላይ አስቀምጥ፣ ከዚያም ማጥናት የምትፈልጋቸውን ምዕራፎች ምረጥ። PDF ፋይሉ በዚህ መሣሪያ ላይ ይቆያል፤ የመረጥከው የምዕራፍ ጽሑፍ ብቻ ለማስኬድ ይላካል።",
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
    "መጽሐፉና ይዘቱ በመለያህ ላይ ይቀመጣሉ። PDF ፋይሉ በዚህ መሣሪያ ላይ ይቆያል፤ በሌላ መሣሪያ ላይ ተጨማሪ ምዕራፎችን ለማስገባት PDF ፋይሉን እንደገና ምረጥ።",
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
  "textbook-contents": "የመጽሐፉ ይዘት",
  "choose-from-toc": "ወደ ጥናት መዝገብህ የሚጨመሩ ምዕራፎችን ምረጥ",
  "select-available": "ሁሉንም ምረጥ",
  "clear-selection": "ምርጫውን አጽዳ",
  "select-chapter": "{title} ምረጥ",
  "toc-view-label": "ይዘቱን እንዴት እንሳያ",
  "toc-tab-checklist": "ምርጫ ዝርዝር",
  "toc-tab-checklist-hint": "ሁሉንም ምዕራፎች በአንድ ገጽ።",
  "toc-tab-contents": "ይዘት",
  "toc-tab-contents-hint": "የመጽሐፉን ቁጥርነት በራሱ አቀርበ።",
  "toc-tree-label": "የመጽሐፉ ይዘት",
  "toc-nothing-picked": "በዚህ መጽሐፍ ውስጥ {total} ግብዓቶች አሉ። የምትፈልገውን ምረጥ።",
  "toc-picked-summary": "ከ{total} ውስጥ {picked} ተመርጠል",
  "toc-inside": "{n} ውስጥ",
  "toc-no-topics": "በዚህ ምዕራፍ ውስጥ ምንም አለም",
  "toc-expand-all": "ሁሉንም ክፈት",
  "toc-collapse-all": "ሁሉንም ዝጋ",
  "toc-expand": "{title} ክፈት",
  "toc-collapse": "{title} ዝጋ",
  "toc-empty": "በዚህ መጽሐፍ ውስጥ ይዘት አልተገኘም።",
  "hierarchy-report-label": "ከዚህ መጽሐፍ የተነበበው",
  "hierarchy-report-source": "ከየት ተነብቷል",
  "hierarchy-report-contents": "የይዘት ገጽ",
  "hierarchy-report-contents-missing": "አልተገኘም",
  "hierarchy-report-pages": "ገጾች ተነብተዋል",
  "hierarchy-report-offset": "የገጽ ልዩነት",
  "hierarchy-report-none": "አልተረጋገጠም",
  "hierarchy-report-entries": "ግብዓቶች / ምዕራፎች",
  "hierarchy-report-copy": "ይህን ንባብ ቅዳ",
  "hierarchy-report-copied": "ተቀድቷል",
  "saved-book-device-note":
    "መጽሐፉና ይዘቱ በመለያህ ላይ ተቀምጠዋል። PDF ፋይሉ በዚህ መሣሪያ ላይ ይቆያል፤ የተመረጠው ምዕራፍ ጽሑፍ ለጥናት ማስኬድ ይላካል።",
  "save-textbook": "መጽሐፉን አስቀምጥ",
  "textbook-saved": "መጽሐፉና ይዘቱ ተቀምጠዋል።",
  "textbook-saved-local-error":
    "መጽሐፉ በመለያህ ላይ ተቀምጧል፣ ግን PDF ፋይሉን በዚህ መሣሪያ ላይ ማስቀመጥ አልተቻለም። በሚቀጥለው ጊዜ ለማስገባት PDF ፋይሉን እንደገና ምረጥ።",
  "reselect-textbook-source":
    "ይህ መሣሪያ የመጀመሪያውን ፋይል አያስቀምጠውም። ለመቀጠል የመጀመሪያውን PDF እንደገና ምረጥ።",
  "reselect-textbook-text":
    "ይህ መሣሪያ የተለጠፈውን ጽሑፍ አያስቀምጠውም። ተጨማሪ ምዕራፎችን ለማስገባት የመጀመሪያውን ጽሑፍ እንደገና ለጥፍ።",
  "textbook-file-mismatch":
    "ይህ ፋይል ከተቀመጠው የመጽሐፍ ምንጭ ጋር አይዛመድም። የተሳሳቱ ምዕራፎችን እንዳታስገባ የመጀመሪያውን PDF ምረጥ።",
  "textbook-source-conflict":
    "ይህ ርዕስ ከሌላ የመጽሐፍ ምንጭ ጋር ተያይዞ ምዕራፎች ቀድሞ ገብተዋል። ሁለቱንም መጽሐፎች ለመለየት አዲስ ርዕስ ተጠቀም።",
  "saved-toc-chapters": "በይዘቱ ውስጥ {n} ምዕራፎች",
  "view-book-contents": "የመጽሐፉን ይዘት አሳይ · {n} ምዕራፎች",
  "imported-chapters": "{n} ምዕራፎች ገብተዋል",
  "no-chapters-imported": "ገና ምዕራፎች አልገቡም።",
  "study-section": "የጥናት ክፍል {n} ከ {total}",
  "chapter-section": "ክፍል {n}",
  "choose-chapters": "ምዕራፎችን ምረጥ",
  "select-to-import": "ለማስገባት ምዕራፎችን ምረጥ",
  "chapter-progress": "{progress} ከ {total} ምዕራፎች",
  "import-chapter-n": "{n} ምዕራፍ አስገባ",
  "import-chapters-n": "{n} ምዕራፎችን አስገባ",
  "import-entry-n": "{n} ግብዓት አስገባ",
  "import-entries-n": "{n} ግብዓቶችን አስገባ",
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
    "PDF እስከ {max} MB። የተስካኑ ገጾች በዚህ መሣሪያ ላይ ይነበባሉ፤ ሲያስገቡ ለማንበብ ምዕራፍ ይምረጡ።",
  "paste-placeholder":
    "የመጽሐፉን ጽሑፍ እዚህ ገልብጥ (በአንድ ጊዜ ጥቂት ምዕራፎች)። እንደ \u201CUnit 1\u201D ወይም \u201Cምዕራፍ 2\u201D ያሉ አርዕስቶች ምዕራፎችን ለመለየት ይረዳሉ።",
  characters: "{n} ቁምፊዎች",
  "headings-detect":
    "እንደ \u201CUnit 1\u201D ወይም \u201Cምዕራፍ 2\u201D ያሉ የምዕራፍ አርዕስቶች በራሳቸው ይታወቃሉ።",
  "scan-chunks": "የመጽሐፉን ይዘት አንብብ",
  "plan-confirm": "የመጽሐፉን ይዘት መርምር፣ ከዚያም ምዕራፎችን ከማስገባትህ በፊት መጽሐፉን አስቀምጥ።",
  "demo-budget":
    "ይህ ክፍል በአነስተኛ የጥሪ በጀት ይሰራል — ዋና ገጽህ ምን ቀርቷልና መቼ ይሞላል በግልጽ ያሳያል። በመለያ ማስገባት ገደቡን ያሳድጋል፤ የቀኑንም የመጽሐፍ ገደብ ያነሳል።",
  "book-on-shelf": "\u201C{title}\u201D በመደርደሪያው ላይ ነው።",
  "chunk-failed": "{n} ክፍል አልደረሰም። ለማጠናቀቅ እንደገና ሞክር።",
  "chunks-failed": "{n} ክፍሎች አልደረሱም። ለማጠናቀቅ እንደገና ሞክር።",
  "nothing-to-import": "የሚገባ ነገር የለም — ጽሑፉ ባዶ ይመስላል።",

  "pdf-no-text":
    "በዚህ PDF ውስጥ የሚነበበት ጽሑፍ የለም። በመስተግበር የተያዙ ገጾች ወይም የመጽሐፍ ፎቶዎች ይሆናል። የምዕራፉን ጽሑፍ ሰርተር ገልብጠው — የጥናት ዑደቱ እንደሳለ ይሆናል።",
  "pdf-too-thin":
    "ከዚህ PDF {n} ፊደሎችን ብቻ ማንበት ተቻለ — ለመጥናት በቂ አይደለም። ፊደሎቹ ስለማይነበሩ ወይም ገጾቹ በመስተግበር የተያዙ ናቸው። የምዕራፉን ጽሑፍ ሰርተር ገልብጠው።",
  "pdf-header-only":
    "ይህ PDF ይከፍታል፣ ግን ቃላቱ አይወጡም። የገጹ ላይኛው አርማዎችን ብቻ ማንበት ተቻለ — ይህም ገጾቹ ምስሎች እና በዚህ አሳሳሪው የማይችል ፊደል የተጠበቀ ቋንቋ እንደሆነው ያሳያል። የምዕራፉን ጽሑፍ ሰርተር ገልብጠው — የጥናት ዑደቱ እንደሳለ ይሆናል።",

  "ocr-notice":
    "የዚህ መጽሐፍ ቃላት ከፋይሉ አይወጡም፤ ስለዚህ እነሱን ከገጹ ምስል — በዚህ መሣሪያ ላይ፣ ልክ በሆነ መጽሐፉ ሲል ማንለት። እያንዳንዱ ምዕራፍ በመጀመሪያዎ በወርቅ ሁለት ደቂቃ ይያዛል፣ ግን አንድ ጊዜ ብቻ ነው።",
  "ocr-reading-page": "ገጾች {done} ከ{total} በኋላ እየተነበᥨ ነው…",
  "ocr-read-chapter": "ይህን ምዕራፍ ከገጹ ምስል እየነበረ ነው",
  "ocr-unavailable":
    "በዚህ መሣሪያ ላይ የሚገኝ አንባቢ ልሩ ማስጀመር አልተቻለም። የምዕራፉን ጽሑፍ ሰርተር ገልብጠው — የጥናት ዑደቱ እንደሳለ ይሆናል።",
  "ocr-read-nothing":
    "ከእነዚህ ገጾች ምንም ቃል ማንበት አልተቻለም፤ ስለዚህ እዚህ ለመጥናት የለም። ሌላ ምዕራፍ ይሞክሩ ወይም ጽሑፉን ሰርተር ገልብጠው።",

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

  "voice-agent-greeting":
    "በስክሪኑ ላይ ያለው የትምህርት ዞላ — ማስታወሻው፣ ክፍተቱ፣ አጭሩ ማብራሪያው፣ እንደገና ምልክቱ — በገጹ ትኩረት ይመራል፤ እኔም በተፈጥሮ ድምጽ አስተካክሎ እረት ላቀርም። ምዕራፉን በአፖድ አንብብ ወይም በስክሩ ላይ ያለውን ጥያቄ አስቀምጥ፤ ሲጠናቀቅህም በላይ ብቻ አሳውጥኝ፣ ክፍሉንም ዝጋለሁ።",
  "voice-agent-done": "ለአሁን አልቋለሁ",
  "voice-agent-close": "ክፍሉን ዝጋ",
  "voice-agent-dashboard": "ወደ ዳሽባርድ መልስኝ",

  // ── Home / landing page ──────────────────────────────────────
  "hero-eyebrow": "ኪፍተት · ለኢትዮጵያ ተማሪዎች በድምጽ የሚደረግ የትምህርት ግምገማ",
  "diag-eyebrow": "በእውነት የሚያየው",
  "diag-title": "ውጤት አይደለም። በትክክል የሚስተካከል ዝርዝር።",
  "diag-sub":
    "ስለ አንድ ምዕራፍ አንድ ደቂቃ ይናገራለህ። ኪፍተት እያንዳንዱ ሃሳብ ከስምህ በእንዴት መናገርህ ጋር ያወዳዳል። ለምሳሌ በላም አላጠራህን ከበስተዋል በተለየ መለያ ይሰጣል። ይህ ልዩነትም የምርቱ ሁሉ ነው።",
  "diag-unit": "ባዮሎጂ 12 · የእፍሎች አካሳሽ",
  "diag-one-minute": "የ1 ደቂቃ ድምጽ",
  "diag-l3": "3 — ይህን መስሮች መልስ ይሰጣለህ",
  "diag-l1": "1 — ጠቅሞሃል፣ ግን ምንስ ማለት አልገለጠህም",
  "diag-l2": "2 — በተሳሳተኝ ገልጿል",
  "diag-l0": "0 — ገና አልጠበቀም",
  "diag-t3": "ተቀምጧል። በዚህ ላይ ጊዜ አታስፈልግ — ሌሊትህን በሌላ ቦታ አስቀምጥ።",
  "diag-t1":
    "ይህም በግልጽ የሚታይ ውስጥ የተቀመጠ ጥሩ ዜና ነው። ታስታውሻለህ፤ አንድ ግልጽ ዓረፍተኛ ማስረጃ ብቻ ያጠናቅቅዋል።",
  "diag-t2": "ማንበብ እንደማይችልት ነው። መጀመሪያው መተዳሰር፣ ከዚያ ትክክል በማስገባት መሆን አለበት።",
  "diag-t0": "በርቀት ነው — ሁሉም አይሸፍኑም። በጭማሪው የሚሰጠው ነገር ስለዚህ ነው።",
  "diag-punchline":
    "ከሁለቱ አንዱ ከአንድ ዓረፍተኛ መልስ ይፈልጋል። አንዱ ደግሞ መርማር ሳይሆን ማስተካከል አለበት። ይህ ከጠንላ ምዕራፉን ማስረስ በተለየ የምሽት ነው — እና ከስድስት ሳምንት ተስጠር ከስድስት ቀን ማወቅ ጋር ያለው ልዩነትም ነው።",
  "demo-c-1": "ፎቶሲንቴሲስ",
  "demo-c-2": "ክሎሮፊል እና የተጠበሰ ብርሃን",
  "demo-c-3": "የትንታስ መተንበርና ፎቶሲንቴሲስ",
  "demo-c-4": "እስከ ፎቶሲንቴሲስ ውስጥ የሆነ ውሃ",
  "demo-c-5": "ፍጥነትን የሚገደቡ ሁኔታዎች",
  "demo-card-unit": "ባዮሎጂ 12 · የመቅላት ክልል",
  "demo-card-chapter": "የመቅላት ክፍልና አካላቶች",
  "demo-card-c-1": "የመቅላት ትሮሪ",
  "demo-card-c-2": "ሚትዎንድሪያና ATP",
  "demo-card-c-3": "የመቅላት አገላቂና ማዕከል",
  "demo-card-c-4": "ሪቦሶሞችና የፕሮቴን ማስፈርጌት",
  "demo-card-c-5": "አካላቶች በምትሎቻቸው የሚቆዩበት መንገድ",
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

  // ── Launch waitlist ────────────────────────────────────────
  "waitlist-chip": "የመስተጀት ዝርዝር",
  "waitlist-title": "ኪፍተት ሲጀምር ቀድሞ ይንሱ",
  "waitlist-text":
    "ስልክህን እንውስለን — ኪፍተት የተጀመረ ቁስብ ብቻ እናሳውቅለን። ከዚያ ሌላ መልዕክት የለም።",
  "waitlist-reward":
    "የቴሌግራም ቻናላችን ተቀልበህ የሳንስኝህ ውጤት በአንድ ወረፍ ላንተን፣ በመስተጀት ቀን አንድ ወር ክፍል ጥሩ ያገኛህ።",
  "waitlist-name": "ስምህ",
  "waitlist-phone": "የሞባይል ቁጥር",
  "waitlist-phone-hint": "ለምሳሌ 0911 234 567",
  "waitlist-consent":
    "ኪፍተት ሲጀምር ስያኝ በዚህ ቁጥር እንያለቅድ ይችላል። በየጊዜም ማጥፋት እንደምችል እችላለሁ።",
  "waitlist-cta": "ወደ ዝርዝሩ ግባ",
  "waitlist-joining": "ቦታህን በመቀመጥ ላይ…",
  "waitlist-joined": "በዝርዝሩ ላይ አለህ",
  "waitlist-wave": "ዙር {wave} · ውስጥ ነህ",
  "waitlist-closed": "ዝርዝሩ አሁን ሙሉ ነው። ቻናችን ተቀልበህ ማበሃል ካለው እናሳውቅለን።",
  "waitlist-network":
    "አገልግሎቱን መድረስ አልቻልንም። ግንኙነትህን አረጋግጥና እንደገና ሞክር — ቁጥርህ ሁለት ጊዜ አይቆጠርም።",
  "waitlist-invalid-phone": "የሞባይል ቁጥር አለህ፣ ለምሳሌ 0911 234 567።",
  "waitlist-open-telegram": "ቴሌግራም አገናኝ",
  "waitlist-open-channel": "ቻናውን ክፈት",
  "waitlist-step-channel": "1. የቴሌግራም ቻናላችን ተቀልበህ",
  "waitlist-step-verify": "2. በቻናላችን ውስጥ /joined ላክ",
  "waitlist-step-testimonial": "3. አንድ ወረፍ ላንተንኝ",
  "waitlist-verify-hint":
    "ትክክለኛውን መግባት ከቴሌግራም እንረጋግጣለን፤ ስለዚህ በቻናላችን ውስጥ /joined ሲልክ ይህ ራሱን ይስተራል።",
  "waitlist-step-done": "ሁሉም ተጠናቋል — በመስተጀት ቀን የክፍል ወርህ ተወርዷል።",
  "waitlist-check": "ቦታህን አረጋግጥ",
  "waitlist-privacy": "ቁጥርህን እንዴት እንጠቀማለን",

  // ── Coverage view (the flagship gap visualization) ───────────
  "cov-checked": "ከምርመራቸው ሃሳቦች የተረጋገጡት በዕጉም",
  "cov-solid": "ጠንካራ",
  "cov-gap": "ክፍተት",
  "cov-wrong": "በተሳሳተኝ መልክት",
  "cov-aria": "ከ{total} ሃሳቦች {covered} ተሸፍነዋል፣ {missing} ክፍተቶች አሁንም ክፍት ናቸው",
  "cov-aria-wrong": "፣ {n} በተሳሳተኝ ተገልጸዋል",
  "cov-aria-almost": "፣ {n} ተጥቅሞል ግን አልተፈረሰም",
  "cov-importance": "አስፈላጊነት {n}/5",
  "cov-legend-sage": "የጠነ",
  "cov-legend-gold": "ተቃርበ",
  "cov-legend-rust": "ተሳሳተኝ",
  "cov-legend-open": "አልተጥቀሰም",
  "cov-already-solid": "አስቀድሞ የጠኑ",
  "cov-needs-work": "ስራ ይፈልጋል",
  "cov-none-yet": "ገና ምንም አልተረጋገጠም — ይህም መጀመሪያው ነው።",
  "cov-all-solid": "ምንም የለም። ከምርመራቸው የጠኑ ሁሉም ሃሳቦች ናቸው።",
  "cov-almost-title": "በጣም ተቃርቧል — ጥቅሞታው አለበት",
  "cov-almost-text":
    "እነዚህን ጠቅሞታ ነህ፤ ግን እርስዎ ያለውን ትርጉም ወይም ምክንያቱን ስለማልተና አልጠናከትም። እያንዳንዱ በአንድ ግልጽ ዓረፍተኛ ማስረጃ ብቻ ይችላል — እዚህም ምርጥ ማስገንድ ነው።",
  "cov-wrong-title": "አንቀታ — በተሳሳተኝ ተገልጿል",
  "cov-wrong-text":
    "እነዚህ ያልዘለስት ሃሳቦች አይደሉም፤ በተሳሳተኝ መናገር ተገልጸዋል። አጭሩ ትምህርቱ እነዚህን ቀድሞ ያስተካክላል።",

  // ── Chrome + failure states ─────────────────────────────────
  "nav-primary": "ዋና ይዘት",
  "skip-to-content": "ወደ ይዘቱ ዝለል",
  "go-home": "ወደ መጀመሪያው ተመለስ",
  "err-404-title": "ይህ ገጹ አልተገኘም።",
  "err-404-body": "ሊንኩ ራንት የወረደ ይሆናል ወይም ገጹ ተዛውቷል። ያስቀመጥከው ምንም አልጠፋም።",
  "err-500-title": "አንድ ነገር በእኛ ወገን ተሳስቷል።",
  "err-500-body":
    "ይህ ምርካህ ጥላት አይደለም፣ ያስቀመጥካቸውም ምንም አልጠፋም። እንደገና ሞክር፣ ወይም ወደ የጥናት ክፍሉ ተመለስ።",
  "err-offline-title": "ግንኙነት የለም።",
  "err-offline-body": "ኪፍተት ለአነባ አልተደረሰም። በዚህ ስልክ ላይ ያስቀመጥከው ሁሉም አሁንም አለ።",
  "technical-details": "የቴክኒክ ዝርዝር",
  "close-details": "ዝርዝሩን ደብቅ",
  "sign-in": "ግባ",
  "auth-welcome-back": "እንኳን ደህና መጡ",
  "auth-signin-subtitle": "ፈተናው የሚፈልገውን ክፍተቶች ለመዘጋጀት ግባ።",
  "auth-signin-cta": "ግባ",
  "auth-signin-error": "አሁን መግባት አልተቻለም። እንደገና ሞክር።",
  "auth-open-room": "የትማሪያዎን ክፍል ክፈት",
  "auth-signup-subtitle":
    "አንድ መለያ፣ ሁሉም ምዕራፎች። የመጀመሪያዎን ማስታወስክ ሁለት ደቂቃዎች ይወስዳል።",
  "auth-signup-cta": "መለያ ፍጠር",
  "auth-account-created": "መለያው ተፈጥሯል",
  "auth-name-label": "ስም",
  "auth-email-label": "ኢሜይል",
  "auth-password-label": "የይለፍ ቃል",
  "auth-invalid-email": "የተሳሳተ የኢሜይል አድራሻ",
  "auth-password-too-short": "የይለፍ ቃል ቢያንስ 8 ፊደል ማድረግ አለበት",
  "auth-check-email-title": "ኢሜይልዎን ይመልከቱ",
  "auth-check-email-body": "ወደ {email} አድራሻ ልኮታል። ሂደትዎን ለማጠናቀቅ አገኙውን ይክፈቱ።",
  "auth-forgot-password": "የይለፍ ቃል ይርሳል?",
  "auth-forgot-title": "የይለፍ ቃል ይቀይሩ",
  "auth-forgot-subtitle": "ኢሜይልዎን ይስጡን፣ አዲስ የይለፍ ቃል ለማስቀመጥ አገኙ ያለውን እንልካለን።",
  "auth-forgot-cta": "የመለስ አገንባር ላክ",
  "auth-or-continue-with": "ወይም ይቀጥሉ",
  "auth-continue-with": "በ{provider} ይቀጥሉ",
  "auth-forgot-sent": "ያለ መለያ ካለው በሆነ፣ የመለስ አገንባር በመንገድ ላይ ነው።",
  "auth-forgot-invalid-email": "በየተመዘጉት ኢሜይል ያስገቡ",
  "auth-forgot-back": "ወደ ግባት ተመለስ",
  "auth-reset-title": "አዲስ የይለፍ ቃል ይምረጡ",
  "auth-reset-subtitle": "እዚህ በይለፍ ቃል አስቀድሞ ያገለገልት የሆነ ነገር ይምረጡ።",
  "auth-reset-cta": "አዲስ የይለፍ ቃል አስቀምጥ",
  "auth-reset-done": "የይለፍ ቃሉ ተዘምኗል። አሁን በዚያ በግባት መግባት ይችላሉ።",
  "auth-reset-no-token": "የመለስ አገንባሩ ያልተሟላ ነው። ከግባት ገጹ አዲስ ይጠይቁ።",
  "auth-reset-failed": "አገኙ የተሰአ ወይም ቀደም የተጠቀመ አገንባር ነው።",
  "auth-new-password-label": "አዲስ የይለፍ ቃል",
  "st-recall-idle":
    "ቀለበቱን ንካ ከዚያ ስለዚህ ምዕራፍ የሚስታውስክህን ነገር በአፍት ተናገር። ማንኛውንም ማስታወሻ የለም — ተንብርና ሐቅሓት ያላቸው ለሚፈለግ ነው። ሲቻልቱ በድጋሚ ንካ።",
  "st-answer-idle":
    "መልስህን በራስህ በራስህ ቃላት በአፍት ተናገር — በመረዳት ስለመረዳት መልስህን ማስታወስክ የሚያሳረጋገጥ ነው። ሲቻልቱ ቀለበቱን ንካ።",
  "st-armed": "ዝግጁ። — ለመጀመር ንካ።",
  "st-connecting": "በመገናኘት ላይ…",
  "st-listening": "በማዳመጥ ላይ… ሲቻልቱ ቀለበቱን ንካ።",
  "st-thinking": "በማሰብ ላይ…",
  "st-speaking": "በመናገር ላይ…",
  "st-executing": "በመሥራት ላይ…",
  "st-error": "የድምጽ አገልግሎቱን መድረስ አልተቻለም። ለመድገም ንካ ወይም ከታች ተይት።",
  "my-account": "መለያዬ",
  "sign-out": "ውጣ",
  "need-account": "መለያ የለህም?",
  "have-account": "መለያ አለህ?",
  "sign-up": "ተመዝገብ",
  "ink-for-the-room": "ለዚህ ክፍል ተስማሚ ቀለም",
  "auth-eyebrow": "ክፍተቱን ዝጋ",
  "auth-promise": "ምዕራፍ በድምጽ ስለርህ፣ የትኞቹ ሃሳቦች አላጨቡበትም በግልጽ እይታ።",
  "auth-quote": "ያስታውስክትን ተናገር። ክፍተቶቹ ሌላውን ያደርጋሉ።",
  "auth-foot": "አንድም ከዜሮ አይጀምሩም።",
  "choose-theme": "ገምት ምረጥ",
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
