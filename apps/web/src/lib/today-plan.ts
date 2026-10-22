export type TodayPlan = {
  minutes: number;
  book: { textbookId: string; title: string; subject: string } | null;
  learn: {
    chapterId: string;
    chapterTitle: string;
    sectionPath: string | null;
    sectionTitle: string | null;
    remainingInChapter: number;
  } | null;
  review: {
    chapterId: string;
    chapterTitle: string;
    concept: string;
    level: number;
    lastCheckedAt: string;
  }[];
  reviewReason: "preference" | "exam" | null;
  examDate: string | null;
  positioned: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Counts calendar days in the student's local timezone, not 24-hour periods. */
export function daysUntilExam(
  examDate: string,
  now = new Date(),
): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(examDate);
  if (!match) return null;

  const [, year, month, day] = match;
  const examYear = Number(year);
  const examMonth = Number(month);
  const examDay = Number(day);
  const exam = new Date(Date.UTC(examYear, examMonth - 1, examDay));
  if (
    exam.getUTCFullYear() !== examYear ||
    exam.getUTCMonth() !== examMonth - 1 ||
    exam.getUTCDate() !== examDay
  ) {
    return null;
  }

  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((exam.getTime() - today) / DAY_MS);
}
