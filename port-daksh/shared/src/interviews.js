/**
 * Live interviews: the vocabulary and the scoring rule shared by the server (which writes the report) and
 * the client (which shows it), so the two can never disagree about how the overall score is made.
 */

/** The rounds an interview moves through, in order. The interviewer tags each question with one of them. */
export const LIVE_ROUNDS = ['Warm-up', 'Resume deep-dive', 'Technical', 'Problem solving', 'Behavioral', 'Role fit', 'Wrap-up'];

export const LIVE_DIFFICULTIES = ['Easy', 'Medium', 'Hard'];

/** [key, label, weight]. Weights add up to 100. */
export const INTERVIEW_SCORES = [
  ['technical', 'Technical knowledge', 25],
  ['problemSolving', 'Problem solving', 15],
  ['communication', 'Communication', 15],
  ['relevance', 'Relevance of answers', 15],
  ['jobFit', 'Job fit', 15],
  ['resumeConsistency', 'Resume consistency', 10],
  ['confidence', 'Confidence', 5],
];

export const INTERVIEW_FORMULA =
  'Overall = 25% technical knowledge + 15% problem solving + 15% communication + 15% relevance + 15% job fit + 10% resume consistency + 5% confidence. Scores are estimates from the transcript, not guarantees.';

/** Weighted overall score, 0–100, from the seven sub-scores. */
export function overallOf(scores) {
  const total = INTERVIEW_SCORES.reduce((sum, [key, , weight]) => sum + (Number(scores?.[key]) || 0) * weight, 0);
  return Math.max(0, Math.min(100, Math.round(total / 100)));
}

/** Recruiter-style recommendation for an overall score. */
export function verdictOf(overall) {
  if (overall >= 85) return 'Strong hire';
  if (overall >= 72) return 'Hire';
  if (overall >= 60) return 'Lean hire';
  if (overall >= 45) return 'Lean no hire';
  return 'No hire';
}

/** How long to wait before treating an interview whose connection vanished as finished (ms). */
export const LIVE_RECONNECT_GRACE_MS = 5 * 60 * 1000;
