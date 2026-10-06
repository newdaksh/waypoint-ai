/**
 * Resumes and the results computed from them.
 *
 * A workspace holds several resumes; the active one is what every analysis reads. Each result remembers
 * the resume it was made from in `madeFrom` ("bullets" or "atsBy:<jobId>" → resume id), so switching
 * resumes hides the other resume's results instead of showing them as if they were about this one.
 * Nothing is deleted by switching: go back and they are there again.
 */

/** The resume every analysis runs against (falls back to the first one). */
export const activeResumeOf = (ws) => ws.resumes.find((r) => r.id === ws.activeResumeId) || ws.resumes[0] || null;

// Single results, and the value each shows as while it belongs to another resume.
const RESUME_SLOTS = { bullets: null, questions: [], roadmap: null, claimTests: {} };
// Per-job results (maps keyed by job id).
const RESUME_MAPS = ['atsBy', 'tailorBy', 'proofBy', 'priorityBy', 'decoderBy', 'gapBy'];

/**
 * The workspace as the active resume sees it: `analysis` is that resume's analysis, and results made
 * from another resume are blanked. Both the client and the AI tasks read the workspace through this.
 */
export function scopeToResume(ws) {
  const rid = activeResumeOf(ws)?.id;
  const made = ws.madeFrom || {};
  const mine = (tag) => !made[tag] || made[tag] === rid;

  const out = { ...ws, analysis: ws.analysisBy?.[rid] ?? null };
  for (const [key, blank] of Object.entries(RESUME_SLOTS)) if (!mine(key)) out[key] = blank;
  if (!mine('questions')) Object.assign(out, { answers: {}, evals: {} }); // they index into the questions
  for (const key of RESUME_MAPS) {
    out[key] = Object.fromEntries(Object.entries(ws[key] || {}).filter(([id]) => mine(`${key}:${id}`)));
  }
  return out;
}

/** Record, in the patch itself, that the results it writes were made from this resume. */
export function stampResume(patch, resumeId) {
  const tags = {};
  for (const key of Object.keys(RESUME_SLOTS)) if (key in (patch.set || {}) || key in (patch.merge || {})) tags[key] = resumeId;
  for (const key of RESUME_MAPS) for (const id of Object.keys(patch.merge?.[key] || {})) tags[`${key}:${id}`] = resumeId;
  return Object.keys(tags).length ? { ...patch, merge: { ...patch.merge, madeFrom: tags } } : patch;
}

/** Patch that deletes a resume, its analysis and the per-job results made from it. */
export function removeResumePatch(ws, resumeId) {
  const resumes = ws.resumes.filter((r) => r.id !== resumeId);
  const merge = { analysisBy: { [resumeId]: null }, madeFrom: {} };
  for (const [tag, owner] of Object.entries(ws.madeFrom || {})) {
    const at = tag.indexOf(':');
    if (owner !== resumeId || at < 0) continue; // single results are simply replaced by the next run
    const key = tag.slice(0, at);
    merge[key] = { ...merge[key], [tag.slice(at + 1)]: null };
    merge.madeFrom[tag] = null;
  }
  return { set: { resumes, ...(activeResumeOf(ws)?.id === resumeId ? { activeResumeId: resumes[0]?.id || '' } : null) }, merge };
}

/** Patch that deletes a job together with everything computed for it. */
export function removeJobPatch(ws, jobId) {
  const jobs = ws.jobs.filter((j) => j.id !== jobId);
  const active = ws.jobs.find((j) => j.id === ws.activeJobId) || ws.jobs[0];
  const merge = { madeFrom: {} };
  for (const key of RESUME_MAPS) {
    merge[key] = { [jobId]: null };
    merge.madeFrom[`${key}:${jobId}`] = null;
  }
  return { set: { jobs, ...(active?.id === jobId ? { activeJobId: jobs[0]?.id || '' } : null) }, merge };
}
