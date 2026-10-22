import { Button } from "@kiftet/ui/components/button";
import { useEffect, useState } from "react";

import { useLanguage } from "@/components/language-provider";
import {
  DayLengthPicker,
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
  shouldAskPlacement,
} from "@/lib/placement";

/**
 * The one question the planner cannot answer for itself: where are you?
 *
 * It is asked once, and only when it can be answered — a student with no book
 * has nothing to be placed in, and a student who has already said is not
 * asked again. "Not now" is a real answer: it records that the student
 * declined, so the question is never asked a second time. A nag is worse than
 * a wrong default.
 *
 * The card is deliberately short. The book, the chapter, the section, and how
 * much past they want back — and the exam date is not asked here, because it
 * is optional and the countdown is where it belongs.
 */
export function PlacementPrompt({ onSettled }: { onSettled?: () => void }) {
  const { t } = useLanguage();
  const [state, setState] = useState<PlacementState | null>(null);
  const [bookId, setBookId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [topicPath, setTopicPath] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<PlacementPreferences>({
    reviewPreference: "light",
    examDate: null,
    dailyMinutes: 20,
    placementDismissed: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPlacement()
      .then((loaded) => {
        if (cancelled) return;
        setState(loaded);
        setPreferences(loaded.preferences);
        // The first book that actually has chapters. A book that has been
        // imported but not yet ingested has no place to be placed in, and
        // defaulting to it would leave the chapter select empty for no
        // reason the student can see.
        const first = loaded.books.find((book) => book.chapters.length > 0);
        if (first) {
          setBookId(first.id);
          setChapterId(first.chapters[0]?.id ?? "");
        }
      })
      .catch(() => {
        // A placement card that cannot load its own state has nothing to say.
        // The dashboard works without it; failing loudly would be noise.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state) return null;
  if (!shouldAskPlacement(state)) return null;

  const save = async () => {
    if (!bookId || !chapterId) return;
    setSaving(true);
    setError(null);
    try {
      await savePosition({ textbookId: bookId, chapterId, topicPath });
      await savePreferences({
        reviewPreference: preferences.reviewPreference,
        dailyMinutes: preferences.dailyMinutes,
      });
      onSettled?.();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  const dismiss = async () => {
    setSaving(true);
    try {
      await savePreferences({ placementDismissed: true });
      onSettled?.();
    } catch {
      // A dismissal that did not save is a dismissal that did not happen; say
      // so rather than hiding the card without a reason.
      setError(apiError(new Error(t("placement-save-failed"))));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="surface mb-8 border p-5 sm:p-6">
      <div className="space-y-1.5">
        <p className="k-label">{t("placement-label")}</p>
        <h2 className="font-display font-semibold text-xl tracking-tight">
          {t("placement-title")}
        </h2>
        <p className="max-w-md text-muted-foreground text-sm leading-6">
          {t("placement-text")}
        </p>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <PositionPicker
          books={state.books}
          bookId={bookId}
          chapterId={chapterId}
          topicPath={topicPath}
          idPrefix="placement"
          onChange={(next) => {
            setBookId(next.bookId);
            setChapterId(next.chapterId);
            setTopicPath(next.topicPath);
          }}
        />

        <div className="space-y-5">
          <div className="space-y-2.5">
            <p className="k-label">{t("placement-review-title")}</p>
            <ReviewPreferencePicker
              value={preferences.reviewPreference}
              onChange={(reviewPreference) =>
                setPreferences((current) => ({ ...current, reviewPreference }))
              }
            />
          </div>
          <DayLengthPicker
            value={preferences.dailyMinutes}
            onChange={(dailyMinutes) =>
              setPreferences((current) => ({ ...current, dailyMinutes }))
            }
            idPrefix="placement"
          />
        </div>
      </div>

      {error && <p className="mt-4 text-destructive text-sm">{error}</p>}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button disabled={saving || !chapterId} onClick={save}>
          {t("placement-save")}
        </Button>
        <Button variant="ghost" disabled={saving} onClick={dismiss}>
          {t("placement-later")}
        </Button>
      </div>
    </section>
  );
}
