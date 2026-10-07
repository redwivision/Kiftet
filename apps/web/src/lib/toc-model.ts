import { api } from "./api";
import type { ContentsReader, ModelContents } from "./textbook";

/**
 * Read a textbook's own table of contents with the model.
 *
 * Used by `planImport` only when the deterministic parse found nothing — the
 * word "contents" was not on any of the first fifteen pages, so there was no
 * contents line to read. Everything here is best-effort by design: a student
 * importing a book must never see an error because the model was busy, over
 * budget, or because they are not signed in yet. The caller falls back to the
 * running-header scan, which is the answer the browser would have produced on
 * its own.
 */
export const readContentsWithModel: ContentsReader = async (probe) => {
  if (!probe.pages.length) return null;
  try {
    const data = await api<unknown>("/textbooks/contents", {
      method: "POST",
      body: JSON.stringify({ pages: probe.pages }),
    });
    if (!data || typeof data !== "object") return null;
    const candidate = data as Partial<ModelContents>;
    if (typeof candidate.found !== "boolean" || !Array.isArray(candidate.units))
      return null;
    return { found: candidate.found, units: candidate.units };
  } catch {
    // Over budget, signed out, offline, or the call timed out. Falling back is
    // a worse structure and a working import; raising is a dead end.
    return null;
  }
};
