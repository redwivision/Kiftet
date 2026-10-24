import { Button } from "@kiftet/ui/components/button";
import { useEffect, useState } from "react";

import { useLanguage } from "@/components/language-provider";
import {
  DayLengthPicker,
  ExamDatePicker,
  PositionPicker,
  ReviewPreferencePicker,
} from "@/components/placement-picker";
import { apiError } from "@/lib/api";
import {
  getPlacement,
  type PlacementPreferences,
  type PlacementState,
  savePosition,
  savePreferences,
} from "@/lib/placement";
import type { Route } from "./+types/settings";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Your study — Kiftet" },
    {
      name: "description",
      content:
        "Where you are in your book, how much of the past you want brought back, and how long a study day is.",
    },
  ];
}

type Draft = { bookId: string; chapterId: string; topicPath: string | null };

/**
 * The student's own settings — where they are in their books, and the habits
 * around it.
 *
 * This is the second half of placement: the first question is asked once, in
 * the moment the app first understands the student, and this is where the
 * answer changes. A student halfway through a term is somewhere else now, and
 * a plan built on last month's answer is confidently wrong.
 */
export default function Settings() {
  const { t } = useLanguage();
  const [state, setState] = useState<PlacementState | null>(null);
  const [preferences, setPreferences] = useState<PlacementPreferences | null>(
    null,
  );
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [savingBook, setSavingBook] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPlacement()
      .then((loaded) => {
        if (cancelled) return;
        setState(loaded);
        setPreferences(loaded.preferences);
        setDrafts(
          Object.fromEntries(
            loaded.books.map((book) => [
              book.id,
              {
                bookId: book.id,
                chapterId: book.currentChapterId ?? book.chapters[0]?.id ?? "",
                topicPath: book.currentTopicPath,
              },
            ]),
          ),
        );
      })
      .catch((err) => {
        if (!cancelled) setError(apiError(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const savePreferencesNow = async () => {
    if (!preferences) return;
    setSavingPrefs(true);
    setError(null);
    setSaved(false);
    try {
      const result = await savePreferences({
        reviewPreference: preferences.reviewPreference,
        examDate: preferences.examDate,
        dailyMinutes: preferences.dailyMinutes,
      });
      setPreferences(result.preferences);
      setSaved(true);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSavingPrefs(false);
    }
  };

  const saveBook = async (bookId: string) => {
    const draft = drafts[bookId];
    if (!draft?.chapterId) return;
    setSavingBook(bookId);
    setError(null);
    setSaved(false);
    try {
      await savePosition({
        textbookId: bookId,
        chapterId: draft.chapterId,
        topicPath: draft.topicPath,
      });
      setSaved(true);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSavingBook(null);
    }
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-3 py-6 sm:px-6 sm:py-10 lg:px-8">
      <header className="mb-8 space-y-2">
        <p className="k-label">{t("placement-label")}</p>
        <h1 className="font-display font-semibold text-3xl tracking-[-0.02em] sm:text-4xl">
          {t("settings-study-title")}
        </h1>
        <p className="text-muted-foreground text-sm leading-6">
          {t("settings-study-text")}
        </p>
      </header>

      {error && (
        <p className="mb-6 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-destructive text-sm">
          {error}
        </p>
      )}

      {preferences && (
        <section className="surface mb-8 space-y-6 border p-5 sm:p-6">
          <div className="space-y-1.5">
            <h2 className="font-display font-semibold text-lg tracking-tight">
              {t("placement-review-title")}
            </h2>
            <p className="text-muted-foreground text-sm leading-6">
              {t("placement-review-hint")}
            </p>
          </div>
          <ReviewPreferencePicker
            value={preferences.reviewPreference}
            onChange={(reviewPreference) =>
              setPreferences((current) =>
                current ? { ...current, reviewPreference } : current,
              )
            }
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <DayLengthPicker
              value={preferences.dailyMinutes}
              onChange={(dailyMinutes) =>
                setPreferences((current) =>
                  current ? { ...current, dailyMinutes } : current,
                )
              }
              idPrefix="settings"
            />
            <ExamDatePicker
              value={preferences.examDate}
              onChange={(examDate) =>
                setPreferences((current) =>
                  current ? { ...current, examDate } : current,
                )
              }
              idPrefix="settings"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={savingPrefs} onClick={savePreferencesNow}>
              {t("placement-save")}
            </Button>
            {saved && (
              <span className="text-muted-foreground text-xs">
                {t("placement-saved")}
              </span>
            )}
          </div>
        </section>
      )}

      {state && state.books.length > 0 && (
        <section className="space-y-6">
          <div className="space-y-1.5">
            <h2 className="font-display font-semibold text-lg tracking-tight">
              {t("placement-where-title")}
            </h2>
            <p className="text-muted-foreground text-sm leading-6">
              {t("placement-where-text")}
            </p>
          </div>

          {state.books.map((book) => {
            const draft = drafts[book.id];
            if (!draft) return null;
            return (
              <div key={book.id} className="surface space-y-4 border p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-medium text-base">{book.title}</h3>
                  <p className="text-muted-foreground text-xs">
                    {book.subject}
                  </p>
                </div>
                <PositionPicker
                  books={state.books}
                  bookId={draft.bookId}
                  chapterId={draft.chapterId}
                  topicPath={draft.topicPath}
                  idPrefix={`settings-${book.id}`}
                  showBook={false}
                  onChange={(next) =>
                    setDrafts((current) => ({ ...current, [book.id]: next }))
                  }
                />
                {book.chapters.length === 0 ? (
                  <p className="text-muted-foreground text-xs leading-5">
                    {t("placement-no-chapters")}
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      variant="outline"
                      disabled={savingBook === book.id || !draft.chapterId}
                      onClick={() => saveBook(book.id)}
                    >
                      {t("placement-save-position")}
                    </Button>
                    {book.currentChapterId && (
                      <span className="text-muted-foreground text-xs">
                        {t("placement-current")}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {!state && !error && (
        <p className="text-muted-foreground text-sm">{t("loading-ellipsis")}</p>
      )}
    </main>
  );
}
