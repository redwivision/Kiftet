import { type Database, createDb } from "./index";
import { ENV as env } from "./env";
import { syllabus, syllabusUnit } from "./schema";

/**
 * Default syllabus seed for the smallest proof of bet 1 (STRATEGY.md):
 * one subject/grade — Biology, Grade 12 — so browse-by-syllabus has a real
 * structure to hang off.
 *
 * ⚠️ PROVISIONAL. The unit names below are placeholders until a teacher
 * verifies the official EHEEE unit list. The mechanic is the point; the
 * entries are not final. Flip `source` to "verified" only once checked, and
 * never market these as the syllabus in the interim. See STRATEGY.md bet 1.
 */
export const PROVISIONAL_BIO12 = {
	subject: "Biology",
	grade: 12,
	title: "Biology, Grade 12",
	units: [
		{ unitNumber: 1, title: "Biotechnology", description: "Provisional seed — replace with verified EHEEE unit." },
		{ unitNumber: 2, title: "Microorganisms", description: "Provisional seed — replace with verified EHEEE unit." },
		{ unitNumber: 3, title: "Genetics", description: "Provisional seed — replace with verified EHEEE unit." },
		{ unitNumber: 4, title: "Evolution", description: "Provisional seed — replace with verified EHEEE unit." },
		{ unitNumber: 5, title: "Behaviour", description: "Provisional seed — replace with verified EHEEE unit." },
	] as const,
};

// Idempotent: only seeds when no syllabus exists yet, so re-runs never
// duplicate and a verified curriculum can replace the provisional rows by
// wiping the tables first (or a future migration).
export async function ensureDefaultSyllabus(db: Database): Promise<void> {
	const existing = await db.select({ id: syllabus.id }).from(syllabus).limit(1);
	if (existing.length > 0) return;

	const bioId = `bio-${PROVISIONAL_BIO12.grade}`;
	await db.insert(syllabus).values({
		id: bioId,
		subject: PROVISIONAL_BIO12.subject,
		grade: PROVISIONAL_BIO12.grade,
		title: PROVISIONAL_BIO12.title,
		source: "provisional",
	});
	await db.insert(syllabusUnit).values(
		PROVISIONAL_BIO12.units.map(({ unitNumber, title, description }) => ({
			id: `${bioId}-u${unitNumber}`,
			syllabusId: bioId,
			unitNumber,
			title,
			description,
			sortOrder: unitNumber,
		})),
	);
}

// Standalone runner: `bun run db:seed` inside packages/db.
if (import.meta.main) {
	const db = createDb(env);
	try {
		await ensureDefaultSyllabus(db);
		console.log("[kiftet:db] default syllabus ensured (Biology Grade 12, provisional)");
	} finally {
		await db.$client.end();
	}
}