import { analytics } from '@waypoint/shared';

/** The job the user is currently targeting (falls back to the first saved job). */
export const activeJobOf = (ws) => ws.jobs.find((j) => j.id === ws.activeJobId) || ws.jobs[0] || null;

export const jobLabelOf = (job) => (job ? `${job.title} at ${job.company}` : 'your target job');

export const today = () => new Date().toISOString().slice(0, 10);

/** ATS result for the active job, if one has been run. */
export const atsOf = (ws) => {
  const job = activeJobOf(ws);
  return (job && ws.atsBy[job.id]) || null;
};

/** Mean score over every evaluated interview answer and tested resume claim, or null. */
export function interviewAverage(ws) {
  const scores = [
    ...Object.values(ws.evals || {}).map((e) => e.score),
    ...Object.values(ws.claimTests || {}).filter((c) => c.ev).map((c) => c.ev.score),
  ];
  return { count: scores.length, avg: scores.length ? Math.round(scores.reduce((x, y) => x + y, 0) / scores.length) : null };
}

/** Share of roadmap tasks marked done, 0–100. */
export function roadmapPercent(ws) {
  const tasks = ws.roadmap ? ws.roadmap.phases.flatMap((p) => p.tasks) : [];
  return tasks.length ? Math.round((100 * tasks.filter((t) => t.done).length) / tasks.length) : 0;
}

/**
 * Career-readiness score: a weighted average of the components that have been measured, with the
 * weights of unmeasured components redistributed. The formula is shown to the user verbatim.
 */
export function readinessOf(ws) {
  const a = ws.analysis;
  const scores = a?.scores || {};
  const ats = atsOf(ws);
  const { avg: interviewAvg } = interviewAverage(ws);
  const job = activeJobOf(ws);

  const defs = [
    ['Resume Quality', 20, a ? scores.overall : null, 'resume score'],
    ['ATS Readiness', 15, ats ? ats.score : null, 'ATS analysis'],
    ['Skill Match', 20, ats ? ats.keywordCoverage : null, 'keyword coverage'],
    ['Interview Readiness', 20, interviewAvg, 'practice answers'],
    ['Project Proof', 10, a ? scores.proof : null, 'resume analysis'],
    ['Job Fit', 15, ats ? ats.jobFit : null, 'ATS analysis'],
  ];
  const measured = defs.filter((d) => d[2] != null);
  const totalWeight = measured.reduce((x, d) => x + d[1], 0);
  const readiness = totalWeight ? Math.round(measured.reduce((x, d) => x + d[2] * d[1], 0) / totalWeight) : null;

  const components = defs.map(([label, weight, value, source]) => ({
    label,
    weightText: `${weight}%`,
    valueText: value == null ? '—' : value,
    bar: value || 0,
    note: value == null ? (label === 'Interview Readiness' ? 'Practice a question to measure' : 'Not measured yet') : `+${((value * weight) / totalWeight).toFixed(1)} pts · ${source}`,
  }));
  const missing = defs.filter((d) => d[2] == null).map((d) => d[0]);
  const formulaText = !measured.length
    ? 'Nothing is measured yet. Add your resume and a target job, then run an analysis. Your score is a weighted average of the parts that have been measured.'
    : `Weighted average of ${measured.length} of 6 components.` +
    (missing.length ? ` ${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} excluded until measured; the other weights are rescaled to 100%.` : '') +
    ` Uses your resume and ${jobLabelOf(job)}.`;

  return { readiness, readinessDeg: Math.round((readiness ?? 0) * 3.6), components, formulaText };
}

export const statsOf = (ws) => analytics(ws.apps, ws.resumes);

/** Short label of the resume an application was sent with ("v2 · Python roles" → "v2"). */
export const versionShort = (ws, id) => {
  const v = ws.resumes.find((x) => x.id === id);
  return v ? v.name.split(' · ')[0] : '—';
};
