export const STUDY_PLAN_MAX_STEPS = 5;
export const STUDY_PLAN_BUDGETS = [10, 20, 40] as const;
export const STUDY_PLAN_DEFAULT_BUDGET = 20;
export const STUDY_PLAN_CONTENT_BUDGET_MS = 18_000;
// A cold guide generates one section per uncached concept, and the guide route
// is the only place a single click can fan out into many provider calls. Left
// unbounded the loop could run for minutes (up to ~24s per section), outliving
// any client timeout and holding a request open long after the student has
// given up. This wall-clock ceiling bounds the whole loop; concepts past it
// degrade to the lexical skeleton rather than stretching the response.
export const GUIDE_CONTENT_BUDGET_MS = 45_000;
export const READING_WORDS_PER_MINUTE = 120;
export const REVIEW_DUE_DAYS = 2;
