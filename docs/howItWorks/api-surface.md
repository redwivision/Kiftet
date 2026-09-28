# How Kiftet Works — the API surface

> Part of the [how-it-works index](README.md).


All routes live behind `/api`:

| Method & path | What it does | Phase |
|---|---|---|
| `POST /api/chapters/ingest` | Store a textbook chapter, ready for AI concept extraction | 0 (skeleton) |
| `GET /api/chapters` | List all chapters | 0 |
| `GET /api/chapters/:id/concepts` | View a chapter's concept checklist | 0 |
| `POST /api/sessions/start` | Begin a study session on a chapter | 0 |
| `GET /api/sessions/:id` | Session details + its attempts | 0 |
| `POST /api/sessions/:id/recall` | Submit the student's spoken recall transcript → get gaps | 0/2 (AI in 2) |
| `POST /api/sessions/:id/microlesson` | Get the "teach the gaps" read-aloud script | 0/2 (AI in 2) |
| `GET /api/chapters/:id/guide` | The ordered guide sections for this student (cached per chapter) | 0/11 (AI only on a cache miss) |
| `POST /api/sessions/:id/retest` | Get new, differently-phrased questions for the gaps | 0/2 (AI in 2) |
| `POST /api/sessions/:id/retest/answer` | Submit retest answers → updated score | 0/2 (AI in 2) |
| `GET /api/sessions/:id/result` | The before/after coverage delta | 0 |
| `POST /api/sessions/:id/complete` | Mark the session finished | 0 |

Additional routes added for Phase 6 (textbook library + demo quotas):

| Method & path | What it does | Phase |
|---|---|---|
| `GET /api/textbooks` | Each textbook with its chunks, in import order | 6 |
| `GET /api/ai/budget` | Demo/signed-in AI quota remaining this minute + daily book cap | 6 |

In Phase 0, the AI-graded endpoints returned **empty placeholders** (empty gaps,
empty questions). The brains are live since Phase 2.

**The gaps payload.** `POST /recall` and `POST /retest/answer` return the same
shape, and `mastery` is the part that matters:

```jsonc
{
  "score": 60,                  // 0-100, derived from mastery + weights
  "estimated": false,           // true => deterministic fallback, not a real grade
  "mastery": {                  // per concept, 0-3  (see glossary)
    "Photosynthesis": 3,        // explained correctly
    "Chlorophyll": 1,           // raised, not really explained
    "Plants do not eat": 2      // explained wrong
  },
  "covered": ["Photosynthesis"],
  "missing": ["Chlorophyll", "Enzyme"],
  "misconceptions": ["Plants do not eat"]
}
```

`covered` / `missing` / `misconceptions` are **derived from `mastery`**, so a
client should read `mastery` for anything per-concept and must not expect the
lists to carry more than the map does. A concept at `2` never appears in
`covered`. The map is also persisted to `attempt.gapsIdentified.mastery`.

`POST /microlesson` and `POST /retest` take only the gap **names**
(`missing`, `misconceptions`) and rebuild the levels server-side, so a lesson is
always aimed at the gaps that were actually graded.

`GET /chapters/:id/guide` takes the levels as a query string instead —
`?language=en&mastery=<urlencoded name:level, name:level>` — because the order
of the guide *is* the answer to "what should I study", and the client already
has the map from grading. Concept names are percent-encoded, because they come
from a model and may contain commas. Ordering is computed server-side by
`triageConcepts`, so two students with the same map get the same guide.

That route is authorised against the **chapter owner** rather than a session id,
like `POST /chapters/ingest`: generated content for a chapter is not a session
artefact, and a session id would let any student who knows a chapter id ask for
a lesson in a chapter that is not theirs. A different legitimate user gets
`404`, not `403` — the route should not confirm the chapter exists.

**Cache semantics worth knowing at 2am:** a `guide_section` row is written once
per `(chapter, concept, language)` and then never regenerated, so a bad
generation is sticky. To force a rewrite, delete the row; there is no
regeneration path, by design, because that is what keeps the second student
free.

Every route below is mounted behind the `requireAuth` middleware — a request
without a valid session gets `401` before it ever reaches the route (see the [authentication sector](auth.md)).

**Phase 6 (textbook import) note:** the device extracts the book's text and
TOC locally and posts each **chunk** through `POST /api/chapters/ingest` (the
server reuses one textbook row per title and skips chunks it already has, so
re-importing mid-book is a free resume). Two extra routes above support the
library view and the visible AI budget.

---

