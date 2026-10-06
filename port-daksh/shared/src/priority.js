export const PRIORITY_FORMULA =
  'Priority score = 35% resume match + 30% skill match + 15% experience + 20% goal alignment. "Apply now" needs 75+ and non-high learning effort.';

/**
 * Turn the model's per-job sub-scores into a single priority score and label.
 * The weights are deliberately visible to the user (see PRIORITY_FORMULA).
 */
export function priorityOf(p) {
  if (!p) return null;
  const score = Math.round(0.35 * p.resume + 0.3 * p.skill + 0.15 * p.experience + 0.2 * p.goal);
  let label = 'Low priority';
  if (score >= 75 && p.effort !== 'High') label = 'Apply now';
  else if (score >= 65) label = 'Tailor, then apply';
  else if (score >= 50) label = 'Upskill first';
  return { score, label };
}
