import { api, apiError } from "./api";
import type {
  ContentsImageReader,
  ContentsReader,
  ContentsTranscript,
} from "./textbook";

/**
 * Transcribe a textbook's own table of contents with the model.
 *
 * Used by `planImport` when the deterministic parse found nothing — the word
 * "contents" was not on any of the first fifteen pages, so there was no
 * contents line to read. Everything here is best-effort by design: a student
 * importing a book must never see an error because the model was busy, over
 * budget, or because they are not signed in yet. The caller falls back to the
 * running-header scan, which is the answer the browser would have produced on
 * its own.
 *
 * A failure still comes back as an *answer* rather than as `null`, carrying
 * `refused`: the plan hands that sentence to the screen, so the student is
 * told the chapter list below is a guess and why the better one never came.
 */
export const readContentsWithModel: ContentsReader = async (probe) => {
  if (!probe.pages.length) return null;
  try {
    const data = await api<unknown>("/textbooks/contents", {
      method: "POST",
      body: JSON.stringify({ pages: probe.pages }),
    });
    if (!data || typeof data !== "object") {
      return {
        text: "",
        refused: "The AI reader sent back something we could not read.",
      };
    }
    const candidate = data as Partial<ContentsTranscript>;
    if (typeof candidate.text !== "string") {
      return {
        text: "",
        refused: "The AI reader sent back something we could not read.",
      };
    }
    // The server declines for reasons of its own — no key on the deployment,
    // nothing readable in the pages. It says which, and the plan shows that
    // sentence instead of blaming the book for a decision the book made.
    const refused =
      typeof candidate.refused === "string" && candidate.refused.trim()
        ? candidate.refused
        : undefined;
    return refused
      ? { text: candidate.text, refused }
      : { text: candidate.text };
  } catch (error) {
    // Over budget, signed out, offline, or the call timed out. Falling back is
    // a worse structure and a working import; raising is a dead end. The
    // reason still travels with the failure so the fallback can be disclosed.
    return { text: "", refused: apiError(error) };
  }
};

/**
 * Read a contents from a rendering of its page — the last rung of the ladder.
 *
 * The same best-effort contract as [readContentsWithModel], and the same
 * answer shape, so the caller parses the transcript with the identical reader.
 * A failure is an *answer* carrying `refused`, never a throw: the import must
 * not break because the model was busy, the deployment has no vision key, or
 * the student is offline.
 */
export const readContentsFromImage: ContentsImageReader = async (image) => {
  const key = imageKey(image);
  const cached = imageReadCache.get(key);
  if (cached) return cached;
  const result = await requestImageContents(image);
  // Only a real reading is cached. A refusal is often "busy, try again", and
  // caching it would rob the retry.
  if (result.refused === undefined && result.text.trim()) {
    imageReadCache.set(key, result);
  }
  return result;
};

// Session-scoped, so a re-plan or a resume of the same book does not pay for
// the same page twice. Keyed by a cheap hash of the bytes, because the same
// page renders identically and re-sending it is pure waste on a free tier.
const imageReadCache = new Map<string, ContentsTranscript>();
const IMAGE_CACHE_MAX = 24;

function imageKey(image: { mimeType: string; dataBase64: string }): string {
  const data = image.dataBase64;
  let hash = 2166136261;
  // A sampled FNV-1a: enough to separate pages, cheap enough to run on every
  // request, and stable for identical bytes.
  for (let i = 0; i < data.length; i += 97) {
    hash ^= data.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${image.mimeType}:${data.length}:${(hash >>> 0).toString(36)}`;
}

async function requestImageContents(image: {
  mimeType: string;
  dataBase64: string;
}): Promise<ContentsTranscript> {
  try {
    const data = await api<unknown>("/textbooks/contents-image", {
      method: "POST",
      body: JSON.stringify({ image }),
    });
    if (!data || typeof data !== "object") {
      return {
        text: "",
        refused: "The AI reader sent back something we could not read.",
      };
    }
    const candidate = data as Partial<ContentsTranscript>;
    if (typeof candidate.text !== "string") {
      return {
        text: "",
        refused: "The AI reader sent back something we could not read.",
      };
    }
    const refused =
      typeof candidate.refused === "string" && candidate.refused.trim()
        ? candidate.refused
        : undefined;
    if (imageReadCache.size >= IMAGE_CACHE_MAX) {
      const oldest = imageReadCache.keys().next().value;
      if (oldest !== undefined) imageReadCache.delete(oldest);
    }
    return refused
      ? { text: candidate.text, refused }
      : { text: candidate.text };
  } catch (error) {
    return { text: "", refused: apiError(error) };
  }
}

/**
 * Name a textbook from its first pages, the way a cover is meant to be read.
 *
 * The same best-effort contract as [readContentsWithModel]: a busy minute, a
 * signed-out student, or a slow link means "no title" — the import screen
 * fills the title field with a quicker heuristic guess or leaves it blank,
 * and never blocks on this. Whatever comes back is a suggestion the student
 * can simply edit.
 */
export async function readTitleWithModel(
  pages: { index: number; text: string }[],
): Promise<string | null> {
  if (!pages.length) return null;
  try {
    const data = await api<unknown>("/textbooks/title", {
      method: "POST",
      body: JSON.stringify({ pages }),
    });
    if (!data || typeof data !== "object") return null;
    const candidate = data as { title?: unknown; refused?: unknown };
    return typeof candidate.title === "string" && candidate.title.trim()
      ? candidate.title.trim()
      : null;
  } catch {
    return null;
  }
}
