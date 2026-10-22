import { Label } from "@kiftet/ui/components/label";
import { cn } from "@kiftet/ui/lib/utils";
import { Check, ChevronDown } from "lucide-react";

import { useLanguage } from "@/components/language-provider";
import {
  type PlacementBook,
  type PlacementPreferences,
  REVIEW_PREFERENCES,
  type ReviewPreference,
} from "@/lib/placement";

/**
 * The three selects that make up "where are you": the book, the chapter, and
 * the section inside it.
 *
 * The chapter list is the book's own imported chapters, and the section list
 * is the book's own printed contents lines — the same words the student sees
 * on the page, so "3.2" here is the "3.2" they are looking at. A book read
 * from a manual page range has no printed sections, and then the section
 * select is simply not there: a chapter on its own is still a real place to
 * be, and offering a fake choice would be worse than offering none.
 */
export function PositionPicker({
  books,
  bookId,
  chapterId,
  topicPath,
  onChange,
  idPrefix,
  showBook = true,
}: {
  books: PlacementBook[];
  bookId: string;
  chapterId: string;
  topicPath: string | null;
  onChange: (next: {
    bookId: string;
    chapterId: string;
    topicPath: string | null;
  }) => void;
  idPrefix: string;
  showBook?: boolean;
}) {
  const { t } = useLanguage();
  const book = books.find((b) => b.id === bookId) ?? books[0];
  const chapter = book?.chapters.find((c) => c.id === chapterId);
  const topics = chapter?.topics ?? [];

  const selectClass =
    "h-11 w-full appearance-none rounded-full border border-input bg-card/60 px-4 text-[0.95rem] outline-none transition-[color,border-color] duration-200 focus-visible:border-gold/50 focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2 dark:bg-input/30";

  return (
    <div className="space-y-4">
      {showBook && books.length > 1 && (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-book`}>{t("placement-book")}</Label>
          <div className="relative">
            <select
              id={`${idPrefix}-book`}
              value={book?.id ?? ""}
              onChange={(e) => {
                const next = books.find((b) => b.id === e.target.value);
                onChange({
                  bookId: next?.id ?? "",
                  chapterId: next?.chapters[0]?.id ?? "",
                  topicPath: null,
                });
              }}
              className={selectClass}
            >
              {books.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.title}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted-foreground"
            />
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-chapter`}>{t("placement-chapter")}</Label>
        <div className="relative">
          <select
            id={`${idPrefix}-chapter`}
            value={chapter?.id ?? ""}
            onChange={(e) =>
              onChange({
                bookId: book?.id ?? "",
                chapterId: e.target.value,
                topicPath: null,
              })
            }
            className={selectClass}
          >
            <option value="" disabled>
              {t("placement-chapter-choose")}
            </option>
            {(book?.chapters ?? []).map((option) => (
              <option key={option.id} value={option.id}>
                {option.title}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted-foreground"
          />
        </div>
      </div>

      {topics.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-section`}>
            {t("placement-section")}
          </Label>
          <div className="relative">
            <select
              id={`${idPrefix}-section`}
              value={topicPath ?? ""}
              onChange={(e) =>
                onChange({
                  bookId: book?.id ?? "",
                  chapterId: chapter?.id ?? "",
                  topicPath: e.target.value || null,
                })
              }
              className={selectClass}
            >
              <option value="">{t("placement-section-whole")}</option>
              {topics.map((option) => (
                <option key={option.path} value={option.path}>
                  {option.path}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted-foreground"
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * How much of the past the student wants brought back.
 *
 * Three buttons rather than a select, because each one is a different promise
 * and the promise is the thing being chosen — "none" means something quite
 * different from "heavy", and a dropdown hides that behind a word.
 */
export function ReviewPreferencePicker({
  value,
  onChange,
}: {
  value: ReviewPreference;
  onChange: (next: ReviewPreference) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {REVIEW_PREFERENCES.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={cn(
              "flex items-start gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition-colors duration-200",
              active
                ? "border-gold/50 bg-gold/10"
                : "border-border/70 bg-background/40 active:bg-muted/60",
            )}
          >
            <span className="min-w-0 leading-tight">
              <span className="block font-medium text-sm">
                {t(`placement-review-${option.value}`)}
              </span>
              <span className="mt-0.5 block text-[0.78rem] text-muted-foreground">
                {t(`placement-review-${option.value}-note`)}
              </span>
            </span>
            {active && (
              <Check
                className="ms-auto size-4 shrink-0 text-gold"
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The length of a study day.
 *
 * A number the student can change, with the default stated next to it. The
 * point is not that twenty is right — it is that twenty is a *default*, and
 * the control is one tap away.
 */
export function DayLengthPicker({
  value,
  onChange,
  idPrefix,
}: {
  value: number;
  onChange: (next: number) => void;
  idPrefix: string;
}) {
  const { t } = useLanguage();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${idPrefix}-minutes`}>
        {t("placement-minutes-title")}
      </Label>
      <div className="relative">
        <select
          id={`${idPrefix}-minutes`}
          value={String(value)}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-11 w-full appearance-none rounded-full border border-input bg-card/60 px-4 text-[0.95rem] outline-none transition-[color,border-color] duration-200 focus-visible:border-gold/50 focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2 dark:bg-input/30"
        >
          {[10, 15, 20, 30, 45, 60, 90].map((minutes) => (
            <option key={minutes} value={String(minutes)}>
              {t("placement-minutes", { n: minutes })}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted-foreground"
        />
      </div>
    </div>
  );
}

/**
 * The exam date.
 *
 * Optional on purpose: a student with no exam has no countdown, and the
 * planner works without one. It is a calendar date because an exam is a day,
 * and the days left are counted from the student's own midnight.
 */
export function ExamDatePicker({
  value,
  onChange,
  idPrefix,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  idPrefix: string;
}) {
  const { t } = useLanguage();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${idPrefix}-exam`}>{t("placement-exam-title")}</Label>
      <div className="relative">
        <input
          id={`${idPrefix}-exam`}
          type="date"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          className="h-11 w-full rounded-full border border-input bg-card/60 px-4 text-[0.95rem] outline-none transition-[color,border-color] duration-200 focus-visible:border-gold/50 focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2 dark:bg-input/30"
        />
      </div>
      <p className="text-muted-foreground text-xs leading-5">
        {t("placement-exam-note")}
      </p>
    </div>
  );
}

/** The preferences the student has set, as a plain object for the API. */
export function preferencesPatch(
  preferences: PlacementPreferences,
): Partial<PlacementPreferences> {
  return {
    reviewPreference: preferences.reviewPreference,
    examDate: preferences.examDate,
    dailyMinutes: preferences.dailyMinutes,
  };
}
