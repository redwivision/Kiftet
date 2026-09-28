import type { MasteryLevel } from "@/components/study-provider";

export type ConceptMeta = {
  weight: number;
  isMisconception: boolean;
};

const key = (s: string) => s.trim().toLowerCase();

export function levelOf(
  mastery: Record<string, MasteryLevel | undefined>,
  concept: string,
): MasteryLevel {
  const direct = mastery[key(concept)];
  if (direct !== undefined) return direct;
  for (const [k, v] of Object.entries(mastery)) {
    if (key(k) === key(concept)) return (v ?? 0) as MasteryLevel;
  }
  return 0;
}

/** Mirrors `masteryScore` in `apps/server/src/ai/gemini.ts`: level 3 earns full
 *  weight, level 1 half, level 2 (a wrong belief) nothing, and known
 *  misconception entries are excluded from the denominator entirely.
 *
 *  The server is the authority and sends `gaps.score`; this is the fallback for
 *  the places that only hold the map — the landing page's worked example, and
 *  an attempt cached before the score was stored. If the weighting rule ever
 *  changes, change it in both files: a student must never see two different
 *  numbers for the same chapter. */
export function weightedMastery(
  mastery: Record<string, MasteryLevel | undefined>,
  meta: Record<string, ConceptMeta>,
  concepts: string[],
): number {
  const real = concepts.filter((name) => !meta[name]?.isMisconception);
  if (real.length === 0) return 1;
  let earned = 0;
  let total = 0;
  for (const name of real) {
    const w = meta[name]?.weight ?? 1;
    total += w;
    const level = levelOf(mastery, name);
    if (level === 3) earned += w;
    else if (level === 1) earned += w * 0.5;
  }
  return total > 0 ? Math.min(1, earned / total) : 1;
}

/** The one place the product's opinion about what to study next is written
 *  down, so the gaps screen, the guide and any future plan agree.
 *
 *  A wrong belief comes first because it is actively costing marks and no
 *  amount of re-reading fixes it. A half-raised idea comes second because it is
 *  the cheapest possible win — the student is one sentence away. A blank comes
 *  last, because that is what the short version exists for. */
export type Triage = {
  wrong: string[];
  almost: string[];
  open: string[];
  solid: string[];
};

export function triage(
  mastery: Record<string, MasteryLevel | undefined>,
  concepts: string[],
): Triage {
  const out: Triage = { wrong: [], almost: [], open: [], solid: [] };
  for (const name of concepts) {
    switch (levelOf(mastery, name)) {
      case 2:
        out.wrong.push(name);
        break;
      case 3:
        out.solid.push(name);
        break;
      case 1:
        out.almost.push(name);
        break;
      default:
        out.open.push(name);
    }
  }
  return out;
}

/** Heaviest first. Ties keep the checklist's own order, so a list never
 *  reshuffles between renders of the same data. */
export function byImportance(
  concepts: string[],
  meta: Record<string, ConceptMeta>,
): string[] {
  return [...concepts].sort(
    (a, b) => (meta[b]?.weight ?? 1) - (meta[a]?.weight ?? 1),
  );
}
