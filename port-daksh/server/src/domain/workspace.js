import { DEFAULT_PREFS, stampResume } from '@waypoint/shared';

const today = () => new Date().toISOString().slice(0, 10);
const firstResume = (text = '') => ({ id: 'master', name: 'Master resume', note: 'Your original resume', created: today(), text });

/**
 * A brand-new, empty workspace. Every user starts here: no sample data is ever created for them.
 * The shape is the contract between the AI tasks, the store and the client.
 */
export function emptyWorkspace({ name = '' } = {}) {
  return {
    version: 3,
    profile: { name, role: '', level: 'Entry-level', years: '', location: '', skills: '', goals: '' },
    resumes: [firstResume()], // never empty; tailored versions saved from the Resume Tailor are added here too
    activeResumeId: 'master',
    jobs: [],
    activeJobId: null,
    src: {},
    madeFrom: {}, // which resume each result was made from (see shared/src/resumes.js)
    analysisBy: {},
    atsBy: {},
    decoderBy: {},
    gapBy: {},
    roadmap: null,
    proofBy: {},
    tailorBy: {},
    bulletInput: '',
    bullets: null,
    safetyInput: '',
    safety: null,
    priorityBy: {},
    questions: [],
    answers: {},
    evals: {},
    claimTests: {},
    apps: [],
    chat: [],
    insights: null,
    prefs: { ...DEFAULT_PREFS },
  };
}

/**
 * The update that brings a workspace stored by an older version of the app to the current shape, or
 * null when it already has it. Version 2 had one `resumeText` (with one `analysis`) and a list of
 * `versions` of it; those become the `resumes`, and its results are marked as made from the first one.
 */
export function upgradeOf(doc) {
  if (!doc || doc.resumes) return null;
  const old = Array.isArray(doc.versions) ? doc.versions : [];
  const versions = old.some((v) => v.id === 'master') ? old : [firstResume(), ...old];
  const resumes = versions.map((v) => ({
    id: v.id,
    name: v.name,
    note: v.note || '',
    created: v.created || today(),
    text: v.id === 'master' ? doc.resumeText || '' : v.text || '',
  }));

  const results = { set: {}, merge: {} };
  for (const key of ['bullets', 'roadmap']) if (doc[key]) results.set[key] = doc[key];
  if (doc.questions?.length) results.set.questions = doc.questions;
  for (const key of ['claimTests', 'atsBy', 'tailorBy', 'proofBy', 'priorityBy', 'decoderBy', 'gapBy']) {
    if (Object.keys(doc[key] || {}).length) results.merge[key] = doc[key];
  }

  return {
    $set: {
      version: 3,
      resumes,
      activeResumeId: 'master',
      analysisBy: doc.analysis ? { master: doc.analysis } : {},
      madeFrom: stampResume(results, 'master').merge.madeFrom || {},
    },
    $unset: { resumeText: '', versions: '', analysis: '' },
  };
}
