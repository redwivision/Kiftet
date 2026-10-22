import { api } from "./api";

/**
 * The student's place in their books, and the habits around it.
 *
 * The types live here rather than in a component because two screens use them
 * — the one-off prompt on the dashboard and the settings page — and because the
 * shape is the server's contract, not a view's invention.
 */

export type ReviewPreference = "none" | "light" | "heavy";

export type PlacementPreferences = {
  reviewPreference: ReviewPreference;
  /** A calendar date, "YYYY-MM-DD", or null when the student has not said. */
  examDate: string | null;
  dailyMinutes: number;
  placementDismissed: boolean;
};

/** One line of the book's own contents — "3.2", with the page it starts on. */
export type PlacementTopic = {
  path: string;
  title: string;
  page: number | null;
};

export type PlacementChapter = {
  id: string;
  title: string;
  /** The sections the book prints inside this chapter; empty for a book read
   *  from a manual page range, which has no printed sections to offer. */
  topics: PlacementTopic[];
};

export type PlacementBook = {
  id: string;
  title: string;
  subject: string;
  currentChapterId: string | null;
  currentTopicPath: string | null;
  chapters: PlacementChapter[];
};

export type PlacementState = {
  preferences: PlacementPreferences;
  books: PlacementBook[];
};

export const REVIEW_PREFERENCES: {
  value: ReviewPreference;
  label: string;
  note: string;
}[] = [
  {
    value: "none",
    label: "None",
    note: "Only new material, until you give me an exam date.",
  },
  {
    value: "light",
    label: "Light",
    note: "A little of what is nearly forgotten.",
  },
  {
    value: "heavy",
    label: "Heavy",
    note: "A real review block, with more of the past brought back.",
  },
];

export function getPlacement(): Promise<PlacementState> {
  return api<PlacementState>("/placement");
}

export function savePreferences(
  patch: Partial<
    Pick<
      PlacementPreferences,
      "reviewPreference" | "examDate" | "dailyMinutes" | "placementDismissed"
    >
  >,
): Promise<{ preferences: PlacementPreferences }> {
  return api<{ preferences: PlacementPreferences }>("/placement/preferences", {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

export function savePosition(input: {
  textbookId: string;
  chapterId: string;
  topicPath?: string | null;
}): Promise<{
  textbookId: string;
  chapterId: string;
  topicPath: string | null;
}> {
  return api<{
    textbookId: string;
    chapterId: string;
    topicPath: string | null;
  }>("/placement/position", { method: "PUT", body: JSON.stringify(input) });
}

/**
 * Has the student said where they are?
 *
 * "No" means the app has not been told yet, not that the student has nothing
 * to study — a student with no book has no position because there is nothing
 * to be placed in, and that is not a prompt to show.
 */
export function hasPosition(state: PlacementState | null): boolean {
  if (!state) return false;
  return state.books.some((book) => book.currentChapterId !== null);
}

/**
 * Should the app ask "where are you" right now?
 *
 * The question is asked once and only when it can be answered:
 *
 * - the student has not already said where they are,
 * - the student has not already said "not now",
 * - there is a book with a chapter to be placed in — a book that has been
 *   imported but not yet ingested has no place to point at, and asking anyway
 *   puts a dead question on the dashboard.
 *
 * A nag is worse than a wrong default, so every one of these is a reason to
 * stay quiet.
 */
export function shouldAskPlacement(state: PlacementState | null): boolean {
  if (!state) return false;
  if (state.preferences.placementDismissed) return false;
  if (hasPosition(state)) return false;
  return state.books.some((book) => book.chapters.length > 0);
}
