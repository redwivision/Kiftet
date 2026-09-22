# How Kiftet Works

> **This is the source of truth for how the product works.** If a document
> describes the app and contradicts this one, this one wins. Each sector below
> is one facet; start with [the product](product.md), then follow the path
> that matches what you're trying to do.

Kiftet (ክፍተት, "gap") is a studying tool for Ethiopian students preparing for
the national exam: a student speaks what they remember, the app diagnoses the
specific concepts they **did not** explain, teaches a short lesson covering
*only* those gaps, then re-tests to confirm they closed. The core loop is
**Recall → Diagnose → Relearn → Retest**. The "what" and the mental model are in
[the product](product.md).

## The sectors

| Sector | What it covers | Best for |
|---|---|---|
| [Product](product.md) | What the app is, the four cooperating programs, the vocabulary. | Anyone new |
| [Stack](stack.md) | Monorepo layout, the tech stack and why each choice was made. | Tech review / onboarding |
| [Data flow](dataflow.md) | How a study session actually moves through the system, step by step (endpoints, DB reads/writes, caches). | Building or debugging the loop |
| [Database](database.md) | Every table, every index, and the rules that write to it. | Schema work / migrations |
| [API surface](api-surface.md) | The full request/response contract, error conventions. | Frontend + backend work |
| [Authentication](auth.md) | Sign in / sign up, sessions, cookies, and the trust chain. | Auth work / security review |
| [Security](security.md) | CORS/CSRF/origin, ownership isolation, rate limits, idempotency, guards. | Security review / hardening |
| [Environment](environment.md) | Every env var, where it lives, defaults, and how they're typed. | Setup / deploys |
| [Decisions](decisions.md) | Why-note on the load-bearing choices (voice seam, AI seam, no row-list APIs…). | "Why is it like this?" |
| [Roadmap](roadmap.md) | Phase-by-phase status, the go-live checklist, the resolved hardening/craft passes. | Where we are / what's next |
| [Running](running.md) | How to install, develop, test, and ship the app. | Every dev |
| [Inventory](inventory.md) | The audit trail: every feature and every dependency, cross-checked. | Anything changed |
| [Glossary](glossary.md) | Terms, in one place. | Quick lookup |

## How to use this folder

- **Looking for one specific feature?** Search [the feature index](inventory.md).
  It maps every feature → the sector section that explains it → the key files →
  the API calls.
- **Tracing a study session end-to-end?** [Data flow](dataflow.md), then
  [Database](database.md) for the rows it touches.
- **Adding a table or endpoint?** Read [Database](database.md),
  [API surface](api-surface.md), and [Data flow](dataflow.md) so the change
  lands where the docs say it does — then update them in the same commit.
- **New to the repo?** [Product](product.md) → [Stack](stack.md) →
  [Data flow](dataflow.md).

## Rules

- **One doc per concern.** This folder is split so each file stays under a
  few hundred lines; don't re-merge them.
- **Docs change with code.** If a PR changes how something works, the matching
  sector file changes in the same commit — or the row stops being true.
- **Cross-references by link.** Use markdown links between sector files instead
  of section-number shorthand, so links survive future splits.
- **Source of truth.** Contradiction between a sector file here and another
  document? This folder wins; fix the other document.