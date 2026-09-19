import { randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import { chapter, conceptNode, textbook, user } from "@kiftet/db/schema";
import { getDb } from "../services";

// Demo visitors are anonymous. /demo/start fabricates a throwaway user +
// chapter owned by that user, then remembers the id in this in-memory set.
// The set is the only thing that makes an X-Demo-User-Id header valid, so a
// forged header can impersonate no one — real (better-auth) user ids are never
// in it. On restart the set (and old demo sessions) expire naturally.
const DEMO_USER_IDS = new Set<string>();

export function demoUserFor(req: Request): string | null {
	const id = req.get("x-demo-user-id");
	if (id && DEMO_USER_IDS.has(id)) return id;
	return null;
}

export const DEMO_SEED_TITLE = "Biology — Cell Biology";

const DEMO_TEXTBOOK = {
	title: DEMO_SEED_TITLE,
	subject: "Biology",
	language: "en",
};

const DEMO_CHAPTER = {
	title: "Cell Structure and Function",
	rawText: `Every living organism is built from cells, and each cell carries out the
life processes that keep an organism alive. The plasma membrane surrounds the
cell and controls which substances enter and leave, letting some molecules pass
while blocking others. Inside, the cytoplasm is a watery fluid that holds the
organelles. The nucleus sits at the centre and stores the genetic material,
DNA, directing the cell's activities. Around the nucleus, ribosomes build
proteins from amino acids, mitochondria release energy from food by cellular
respiration to make ATP, and the Golgi apparatus packages proteins and
modifies them for transport to where they are needed. Lysosomes contain enzymes
that digest waste and worn-out cell parts. In plant cells, chloroplasts carry
out photosynthesis to make glucose from sunlight, and a rigid cell wall gives
the cell support and protection. Each organelle has a specific job, and the
cell works because they all cooperate.`,
};

const DEMO_CONCEPTS = [
	"The cell is the basic structural and functional unit of all living organisms",
	"The plasma membrane is a selectively permeable barrier that controls what enters and leaves the cell",
	"Cytoplasm is the fluid inside the cell that holds the organelles",
	"The nucleus stores genetic material (DNA) and controls the cell's activities",
	"Ribosomes are the site of protein synthesis",
	"Mitochondria release energy by cellular respiration, producing ATP",
	"The Golgi apparatus packages and modifies proteins for transport",
	"Lysosomes contain enzymes that digest waste and worn-out cell parts",
	"Chloroplasts are the organelles where photosynthesis occurs in plant cells",
	"The cell wall provides structural support and protection in plant cells",
];

const router = Router();

router.post("/start", async (_req, res) => {
	const db = getDb();
	const userId = randomUUID();
	const textbookId = randomUUID();
	const chapterId = randomUUID();

	try {
		await db.insert(user).values({
			id: userId,
			name: "Demo Explorer",
			email: `${userId}@demo.kiftet`,
			emailVerified: true,
		});
		await db.insert(textbook).values({
			id: textbookId,
			ownerId: userId,
			...DEMO_TEXTBOOK,
		});
		await db.insert(chapter).values({
			id: chapterId,
			textbookId,
			...DEMO_CHAPTER,
		});
		await db.insert(conceptNode).values(
			DEMO_CONCEPTS.map((conceptText, sortOrder) => ({
				id: randomUUID(),
				chapterId,
				conceptText,
				isMisconception: false,
				weight: 1,
				sortOrder,
			})),
		);
	} catch (error) {
		console.error("[demo] setup failed", error);
		res.status(500).json({ error: "Unable to prepare the demo. Try again." });
		return;
	}

	DEMO_USER_IDS.add(userId);
	res.status(201).json({ userId, chapterId });
});

export default router;