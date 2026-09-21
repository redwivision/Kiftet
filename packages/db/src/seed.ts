import { and, eq, notInArray } from "drizzle-orm";
import { type Database, createDb } from "./index";
import { ENV as env } from "./env";
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
			description:
				"The branches and applications of biology across fields, and its importance in tackling societal and environmental challenges.",
		},
		{
			id: "bio-12-u2",
			unitNumber: 2,
			title: "Microorganisms",
			description:
				"The diversity of microorganisms — bacteria, viruses and fungi — their structure, characteristics, and roles in the environment and human health.",
		},
		{
			id: "bio-12-u3",
			unitNumber: 3,
			title: "Energy Transformation",
			description:
				"Energy transformation in living organisms — photosynthesis and cellular respiration — and energy flow and nutrient cycling in ecosystems.",
		},
		{
			id: "bio-12-u4",
			unitNumber: 4,
			title: "Evolution",
			description:
				"The theory of evolution and the mechanisms behind the diversity of life, the evidence for evolution, and the classification of living organisms.",
		},
		{
			id: "bio-12-u5",
			unitNumber: 5,
			title: "Human Body System",
			description:
				"The structure and function of the major organ systems and the regulatory, homeostatic processes that maintain health.",
		},
		{
			id: "bio-12-u6",
			unitNumber: 6,
			title: "Climate Change",
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
				storedUnits[i]?.title.toLocaleLowerCase("en") === u.title.toLocaleLowerCase("en"),
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
					sortOrder: u.unitNumber,
				})
				.onConflictDoUpdate({
					target: syllabusUnit.id,
					set: {
						unitNumber: u.unitNumber,
						title: u.title,
						description: u.description,
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
				and(eq(syllabusUnit.syllabusId, bioId), notInArray(syllabusUnit.id, [...kept])),
			);
	}
}

// Standalone runner: `bun run db:seed` inside packages/db.
if (import.meta.main) {
	const db = createDb(env);
	try {
		await ensureDefaultSyllabus(db);
		console.log(`[kiftet:db] default syllabus ensured (${ET_BIO12.title}, ${ET_BIO12.source})`);
	} finally {
		await db.$client.end();
	}
}