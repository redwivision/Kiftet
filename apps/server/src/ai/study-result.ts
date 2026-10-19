export type ScoredStudyAttempt = {
  stage: string;
  score: number | null;
};

function mean(scores: number[]): number | null {
  if (scores.length === 0) return null;
  return Math.round(
    scores.reduce((sum, score) => sum + score, 0) / scores.length,
  );
}

/** Prefer a cold pretest as the baseline; older or untested sessions use recall. */
export function summarizeStudyScores(attempts: readonly ScoredStudyAttempt[]): {
  before: number | null;
  after: number | null;
} {
  const pretest: number[] = [];
  const recall: number[] = [];
  const retest: number[] = [];

  for (const attempt of attempts) {
    if (attempt.score === null) continue;
    if (attempt.stage === "pretest") pretest.push(attempt.score);
    else if (attempt.stage === "recall") recall.push(attempt.score);
    else if (attempt.stage === "retest") retest.push(attempt.score);
  }

  return {
    before: mean(pretest.length ? pretest : recall),
    after: mean(retest),
  };
}
