// Bet 3 (STRATEGY.md): the offline-first loop's local data layer — a tiny
// promise IndexedDB store, no dependencies. Three object stores:
//
//   chapters  — the owned-chapter list, keyed by chapter id
//   checklist — a chapter's concept checklist, keyed by chapter id
//   outbox    — graded submissions awaiting a connection (see lib/outbox.ts)
//
// Everything is SSR-safe: in a server build (or a browser without IndexedDB)
// every call resolves to a no-op/empty result instead of throwing.

export type ChecklistRow = {
	id: string;
	chapterId: string;
	conceptText: string;
	isMisconception: boolean;
	weight: number;
	sortOrder: number;
};

const DB_NAME = "kiftet-store";
const DB_VERSION = 1;
const STORES = ["chapters", "checklist", "outbox"] as const;

type StoreName = (typeof STORES)[number];

export function dbAvailable(): boolean {
	return typeof indexedDB !== "undefined";
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
	if (!dbAvailable()) return Promise.reject(new Error("IndexedDB unavailable"));
	if (dbPromise) return dbPromise;
	dbPromise = new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			const db = request.result;
			for (const name of STORES) {
				if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () =>
			reject(request.error ?? new Error("IndexedDB open failed"));
	});
	return dbPromise;
}

function tx<T>(
	store: StoreName,
	mode: IDBTransactionMode,
	run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
	return openDb().then(
		(db) =>
			new Promise<T>((resolve, reject) => {
				const t = db.transaction(store, mode);
				const req = run(t.objectStore(store));
				req.onsuccess = () => resolve(req.result);
				req.onerror = () => reject(req.error ?? new Error("store op failed"));
			}),
	);
}

function all<T>(store: StoreName): Promise<T[]> {
	return tx(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>);
}

export function putStore<T>(
	store: StoreName,
	value: T,
	key?: IDBValidKey,
): Promise<void> {
	return tx(
		store,
		"readwrite",
		(s) => s.put(value, key) as unknown as IDBRequest<void>,
	);
}

export function allStore<T>(store: StoreName): Promise<T[]> {
	return all(store);
}

export async function removeStore(
	store: StoreName,
	key: IDBValidKey,
): Promise<void> {
	if (!dbAvailable()) return;
	await tx(store, "readwrite", (s) => s.delete(key) as IDBRequest<void>);
}

// ── Chapters ────────────────────────────────────────────────────

export type CachedChapter = {
	id: string;
	title: string;
	subject: string;
	textbookTitle: string;
	unitId?: string | null;
	cachedAt: number;
};

export async function cacheChapters(rows: CachedChapter[]): Promise<void> {
	if (!dbAvailable()) return;
	await Promise.all(rows.map((row) => putStore("chapters", row, row.id)));
}

export async function getCachedChapters(): Promise<CachedChapter[]> {
	if (!dbAvailable()) return [];
	const rows = await all<CachedChapter>("chapters");
	return rows.sort((a, b) => a.cachedAt - b.cachedAt);
}

export async function getCachedChapter(
	id: string,
): Promise<CachedChapter | null> {
	if (!dbAvailable()) return null;
	return tx(
		"chapters",
		"readonly",
		(s) => s.get(id) as IDBRequest<CachedChapter | undefined>,
	).then((v) => v ?? null);
}

// ── Checklist ───────────────────────────────────────────────────

export type CachedChecklist = {
	chapterId: string;
	rows: ChecklistRow[];
	cachedAt: number;
};

export async function cacheChecklist(
	chapterId: string,
	rows: ChecklistRow[],
): Promise<void> {
	if (!dbAvailable()) return;
	await putStore(
		"checklist",
		{ chapterId, rows, cachedAt: Date.now() },
		chapterId,
	);
}

export async function getCachedChecklist(
	chapterId: string,
): Promise<CachedChecklist | null> {
	if (!dbAvailable()) return null;
	return tx(
		"checklist",
		"readonly",
		(s) => s.get(chapterId) as IDBRequest<CachedChecklist | undefined>,
	).then((v) => v ?? null);
}
