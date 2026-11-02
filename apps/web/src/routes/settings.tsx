import { Button, buttonVariants } from "@kiftet/ui/components/button";
import { Input } from "@kiftet/ui/components/input";
import { Label } from "@kiftet/ui/components/label";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import { useLanguage } from "@/components/language-provider";
import {
  DayLengthPicker,
  ExamDatePicker,
  PositionPicker,
  ReviewPreferencePicker,
} from "@/components/placement-picker";
import { forgetAccount } from "@/lib/account-hint";
import { apiError } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { clearDemoUser } from "@/lib/demo";
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
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [state, setState] = useState<PlacementState | null>(null);
  const [preferences, setPreferences] = useState<PlacementPreferences | null>(
    null,
  );
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [savingBook, setSavingBook] = useState<string | null>(null);
  const [preferencesSaved, setPreferencesSaved] = useState(false);
  const [savedBookId, setSavedBookId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadGeneration = useRef(0);

  const loadPlacement = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    setLoadError(null);
    try {
      const loaded = await getPlacement();
      if (generation !== loadGeneration.current) return;
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
    } catch (err) {
      if (generation === loadGeneration.current) setLoadError(apiError(err));
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlacement();
    return () => {
      loadGeneration.current += 1;
    };
  }, [loadPlacement]);

  const updatePreferences = (update: Partial<PlacementPreferences>) => {
    setPreferences((current) =>
      current ? { ...current, ...update } : current,
    );
    setPreferencesSaved(false);
  };

  const savePreferencesNow = async () => {
    if (!preferences) return;
    setSavingPrefs(true);
    setError(null);
    setPreferencesSaved(false);
    try {
      const result = await savePreferences({
        reviewPreference: preferences.reviewPreference,
        examDate: preferences.examDate,
        dailyMinutes: preferences.dailyMinutes,
      });
      setPreferences(result.preferences);
      setPreferencesSaved(true);
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
    setSavedBookId(null);
    try {
      await savePosition({
        textbookId: bookId,
        chapterId: draft.chapterId,
        topicPath: draft.topicPath,
      });
      setSavedBookId(bookId);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSavingBook(null);
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const { error } = await authClient.deleteUser({
        password: deletePassword || undefined,
      });
      if (error) {
        const code = (error as { code?: string }).code;
        setDeleteError(
          code === "SESSION_EXPIRED"
            ? t("settings-delete-session-expired")
            : code === "INVALID_PASSWORD"
              ? t("settings-delete-password-mismatch")
              : t("settings-delete-error"),
        );
        return;
      }
      forgetAccount();
      clearDemoUser();
      toast.success(t("settings-delete-success"));
      navigate("/");
    } catch {
      setDeleteError(t("settings-delete-error"));
    } finally {
      setDeleting(false);
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
        <p
          role="alert"
          className="mb-6 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-destructive text-sm"
        >
          {error}
        </p>
      )}

      {loadError && (
        <div
          role="alert"
          className="mb-6 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-4"
        >
          <p className="text-destructive text-sm">{loadError}</p>
          <Button
            variant="outline"
            className="mt-3"
            onClick={() => void loadPlacement()}
          >
            {t("retry")}
          </Button>
        </div>
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
              updatePreferences({ reviewPreference })
            }
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <DayLengthPicker
              value={preferences.dailyMinutes}
              onChange={(dailyMinutes) => updatePreferences({ dailyMinutes })}
              idPrefix="settings"
            />
            <ExamDatePicker
              value={preferences.examDate}
              onChange={(examDate) => updatePreferences({ examDate })}
              idPrefix="settings"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button loading={savingPrefs} onClick={savePreferencesNow}>
              {t("placement-save")}
            </Button>
            {preferencesSaved && (
              <span
                role="status"
                aria-live="polite"
                className="text-muted-foreground text-xs"
              >
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
                  onChange={(next) => {
                    setSavedBookId(null);
                    setDrafts((current) => ({ ...current, [book.id]: next }));
                  }}
                />
                {book.chapters.length === 0 ? (
                  <p className="text-muted-foreground text-xs leading-5">
                    {t("placement-no-chapters")}
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      variant="outline"
                      disabled={!draft.chapterId}
                      loading={savingBook === book.id}
                      onClick={() => saveBook(book.id)}
                    >
                      {t("placement-save-position")}
                    </Button>
                    {savedBookId === book.id ? (
                      <span
                        role="status"
                        aria-live="polite"
                        className="text-muted-foreground text-xs"
                      >
                        {t("placement-saved")}
                      </span>
                    ) : book.currentChapterId ? (
                      <span className="text-muted-foreground text-xs">
                        {t("placement-current")}
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {state && state.books.length === 0 && (
        <div className="inner-surface mb-8 flex flex-wrap items-center justify-between gap-4 p-5">
          <p className="text-muted-foreground text-sm leading-6">
            {t("settings-no-books")}
          </p>
          <Link
            to="/textbooks"
            className={buttonVariants({ variant: "outline" })}
          >
            {t("nav-books")}
          </Link>
        </div>
      )}

      {session && (
        <section className="mt-10 space-y-4 rounded-3xl border border-destructive/30 p-5 sm:p-6">
          <div className="space-y-1.5">
            <h2 className="font-display font-semibold text-lg tracking-tight">
              {t("settings-delete-title")}
            </h2>
            <p className="text-muted-foreground text-sm leading-6">
              {t("settings-delete-text")}
            </p>
          </div>

          {deleteError && (
            <p
              role="alert"
              className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-destructive text-sm"
            >
              {deleteError}
            </p>
          )}

          {deleteOpen ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="delete-password">
                  {t("settings-delete-password")}
                </Label>
                <Input
                  id="delete-password"
                  name="delete-password"
                  type="password"
                  autoComplete="current-password"
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                />
                <p className="text-muted-foreground text-xs leading-5">
                  {t("settings-delete-password-hint")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="destructive"
                  loading={deleting}
                  onClick={deleteAccount}
                >
                  {t("settings-delete-confirm")}
                </Button>
                <Button
                  variant="ghost"
                  disabled={deleting}
                  onClick={() => {
                    setDeleteOpen(false);
                    setDeletePassword("");
                    setDeleteError(null);
                  }}
                >
                  {t("settings-delete-cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="destructive"
              onClick={() => {
                setDeleteError(null);
                setDeleteOpen(true);
              }}
            >
              {t("settings-delete-button")}
            </Button>
          )}
        </section>
      )}

      {loading && (
        <p
          role="status"
          aria-live="polite"
          className="text-muted-foreground text-sm"
        >
          {t("loading-ellipsis")}
        </p>
      )}
    </main>
  );
}
