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
| `POST /api/sessions/:id/microlesson` | Get the "teach the gaps" lesson text | 0/2 (AI in 2) |
| `POST /api/sessions/:id/retest` | Get new, differently-phrased questions for the gaps | 0/2 (AI in 2) |
| `POST /api/sessions/:id/retest/answer` | Submit retest answers → updated score | 0/2 (AI in 2) |
| `GET /api/sessions/:id/result` | The before/after coverage delta | 0 |
| `POST /api/sessions/:id/complete` | Mark the session finished | 0 |

Additional routes added for Phase 6 (textbook library + demo quotas):

| Method & path | What it does | Phase |
|---|---|---|
| `GET /api/textbooks` | Each textbook with its chunks, in import order | 6 |
| `GET /api/ai/budget` | Demo/signed-in AI quota remaining this minute + daily book cap | 6 |

In Phase 0, the AI-graded endpoints return **empty placeholders** (empty gaps,
empty questions). The *shape* of the contract is real — the *brains* arrive in
Phase 2.

Every route below is mounted behind the `requireAuth` middleware — a request
without a valid session gets `401` before it ever reaches the route (see the [authentication sector](auth.md)).

**Phase 6 (textbook import) note:** the device extracts the book's text and
TOC locally and posts each **chunk** through `POST /api/chapters/ingest` (the
server reuses one textbook row per title and skips chunks it already has, so
re-importing mid-book is a free resume). Two extra routes above support the
library view and the visible AI budget.

---

