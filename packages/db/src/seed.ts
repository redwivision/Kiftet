import { and, eq, notInArray } from "drizzle-orm";
import { ENV as env } from "./env";
import { createDb, type Database } from "./index";
import { syllabus, syllabusUnit } from "./schema";

/**
 * Default syllabus seed for bet 1 (STRATEGY.md): Biology, Grade 12.
 *
 * VERIFIED — compiled from the MoE New-Curriculum Grade 12 Biology student
 * textbook (2023, ISBN 978-99990-0-011-6, authors Anbessa Dabassa & Eba
 * Alemaychu). Its table of contents defines six units:
 *
 *   1. Application of Biology       4. Evolution
 *   2. Microorganisms               5. Human Body System
 *   3. Energy Transformation        6. Climate Change
 *
 * Source is recorded in `sourceNote` so the claim behind `source: "verified"`
 * is auditable. Unit ids are stable, so chapters mapped to a unit keep their
 * mapping through seed upgrades (the FK is ON DELETE SET NULL for any unit
 * removed).
 *
 * `periods` is deliberately left undefined on every Biology 12 unit. The
 * verified source here is the *student textbook's table of contents*, which
 * gives the six-unit structure but not a period allocation. Filling
 * these in from memory or from a model would be exactly the fabricated
 * authority this column exists to prevent (docs/SYLLABUS.md §4), so they stay
 * NULL until someone transcribes them from the official MoE syllabus document
 * with a page reference. `seedSyllabus` writes them only when a unit actually
 * declares one, so an instructor's later transcription survives boot.
 */
export const ET_BIO12 = {
  id: "bio-12",
  subject: "Biology",
  grade: 12,
  title: "Biology, Grade 12",
  source: "verified",
  sourceNote:
    "MoE New-Curriculum Grade 12 Biology student textbook (2023, ISBN 978-99990-0-011-6; authors Anbessa Dabassa, Eba Alemaychu). Six-unit structure per the textbook's table of contents.",
  units: [
    {
      id: "bio-12-u1",
      unitNumber: 1,
      title: "Application of Biology",
      // Unknown until transcribed from the official syllabus document. NOT
      // zero and NOT guessed — see the note above ET_BIO12.
      periods: undefined,
      periodsSource: undefined,
      description:
        "The branches and applications of biology across fields, and its importance in tackling societal and environmental challenges.",
    },
    {
      id: "bio-12-u2",
      unitNumber: 2,
      title: "Microorganisms",
      // Unknown until transcribed from the official syllabus document.
      periods: undefined,
      periodsSource: undefined,
      description:
        "The diversity of microorganisms — bacteria, viruses and fungi — their structure, characteristics, and roles in the environment and human health.",
    },
    {
      id: "bio-12-u3",
      unitNumber: 3,
      title: "Energy Transformation",
      // Unknown until transcribed from the official syllabus document.
      periods: undefined,
      periodsSource: undefined,
      description:
        "Energy transformation in living organisms — photosynthesis and cellular respiration — and energy flow and nutrient cycling in ecosystems.",
    },
    {
      id: "bio-12-u4",
      unitNumber: 4,
      title: "Evolution",
      // Unknown until transcribed from the official syllabus document.
      periods: undefined,
      periodsSource: undefined,
      description:
        "The theory of evolution and the mechanisms behind the diversity of life, the evidence for evolution, and the classification of living organisms.",
    },
    {
      id: "bio-12-u5",
      unitNumber: 5,
      title: "Human Body System",
      // Unknown until transcribed from the official syllabus document.
      periods: undefined,
      periodsSource: undefined,
      description:
        "The structure and function of the major organ systems and the regulatory, homeostatic processes that maintain health.",
    },
    {
      id: "bio-12-u6",
      unitNumber: 6,
      title: "Climate Change",
      // Unknown until transcribed from the official syllabus document.
      periods: undefined,
      periodsSource: undefined,
      description:
        "Climate change — its causes including human activities — its impacts on ecosystems, and strategies for mitigation and adaptation.",
    },
  ],
};

/**
 * Idempotent seed: inserts the verified Biology-12 syllabus if absent, and
 * upgrades a pre-existing PROVISIONAL row into it (keeping stable unit ids so
 * chapter→unit mappings survive). Once a syllabus is `verified` with matching
 * units it is left untouched — never clobber someone's curated copy.
 */
export async function ensureDefaultSyllabus(db: Database): Promise<void> {
  const { id: bioId, units, source, sourceNote } = ET_BIO12;

  const existing = await db
    .select()
    .from(syllabus)
    .where(eq(syllabus.id, bioId))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(syllabus).values({
      id: bioId,
      subject: ET_BIO12.subject,
      grade: ET_BIO12.grade,
      title: ET_BIO12.title,
      source,
      sourceNote,
    });
    await db.insert(syllabusUnit).values(
      units.map((u) => ({
        id: u.id,
        syllabusId: bioId,
        unitNumber: u.unitNumber,
        title: u.title,
        description: u.description,
        // Only ever written when the seed actually declares a figure. Omitted
        // entirely otherwise, so the column stays NULL ("not stated") instead
        // of acquiring a fabricated 0 that would silently drive prioritisation.
        ...(typeof u.periods === "number"
          ? { periods: u.periods, periodsSource: u.periodsSource ?? sourceNote }
          : {}),
        sortOrder: u.unitNumber,
      })),
    );
    return;
  }

  const row = existing[0];
  if (!row) return;
  const storedUnits = await db
    .select({ title: syllabusUnit.title })
    .from(syllabusUnit)
    .where(eq(syllabusUnit.syllabusId, bioId));
  const titlesMatch =
    storedUnits.length === units.length &&
    units.every(
      (u, i) =>
        storedUnits[i]?.title.toLocaleLowerCase("en") ===
        u.title.toLocaleLowerCase("en"),
    );

  if (row.source === source && titlesMatch) return;

  await Promise.all([
    db
      .update(syllabus)
      .set({ title: ET_BIO12.title, source, sourceNote })
      .where(eq(syllabus.id, bioId)),
    ...units.map((u) =>
      db
        .insert(syllabusUnit)
        .values({
          id: u.id,
          syllabusId: bioId,
          unitNumber: u.unitNumber,
          title: u.title,
          description: u.description,
          ...(typeof u.periods === "number"
            ? {
                periods: u.periods,
                periodsSource: u.periodsSource ?? sourceNote,
              }
            : {}),
          sortOrder: u.unitNumber,
        })
        .onConflictDoUpdate({
          target: syllabusUnit.id,
          set: {
            unitNumber: u.unitNumber,
            title: u.title,
            description: u.description,
            // Same rule on update: this seed owns titles and descriptions, but
            // a period allocation is a human-verified fact about the official
            // document, so the seed must not blank one an instructor has entered.
            // Absent a declared figure the column is simply left out of the
            // SET, which keeps the stored value.
            ...(typeof u.periods === "number"
              ? {
                  periods: u.periods,
                  periodsSource: u.periodsSource ?? sourceNote,
                }
              : {}),
            sortOrder: u.unitNumber,
          },
        }),
    ),
  ]);

  const kept = new Set(units.map((u) => u.id));
  const orphans = await db
    .select({ id: syllabusUnit.id })
    .from(syllabusUnit)
    .where(eq(syllabusUnit.syllabusId, bioId));
  if (orphans.some((o) => !kept.has(o.id))) {
    await db
      .delete(syllabusUnit)
      .where(
        and(
          eq(syllabusUnit.syllabusId, bioId),
          notInArray(syllabusUnit.id, [...kept]),
        ),
      );
  }
}

// Standalone runner: `bun run db:seed` inside packages/db.
if (import.meta.main) {
  const db = createDb(env);
  try {
    await ensureDefaultSyllabus(db);
    console.log(
      `[kiftet:db] default syllabus ensured (${ET_BIO12.title}, ${ET_BIO12.source})`,
    );
  } finally {
    await db.$client.end();
  }
}
