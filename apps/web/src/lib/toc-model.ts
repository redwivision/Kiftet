import { api, apiError } from "./api";
import type { ContentsReader, ModelContents } from "./textbook";

/**
 * Read a textbook's own table of contents with the model.
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
        found: false,
        units: [],
        refused: "The AI reader sent back something we could not read.",
      };
    }
    const candidate = data as Partial<ModelContents> & { refused?: unknown };
    if (
      typeof candidate.found !== "boolean" ||
      !Array.isArray(candidate.units)
    ) {
      return {
        found: false,
        units: [],
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
      ? { found: candidate.found, units: candidate.units, refused }
      : { found: candidate.found, units: candidate.units };
  } catch (error) {
    // Over budget, signed out, offline, or the call timed out. Falling back is
    // a worse structure and a working import; raising is a dead end. The
    // reason still travels with the failure so the fallback can be disclosed.
    return { found: false, units: [], refused: apiError(error) };
  }
};
