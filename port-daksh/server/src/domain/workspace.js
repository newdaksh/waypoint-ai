import { DEFAULT_PREFS } from '@waypoint/shared';

/**
 * A brand-new, empty workspace. Every user starts here: no sample data is ever created for them.
 * The shape is the contract between the AI tasks, the store and the client.
 */
export function emptyWorkspace({ name = '' } = {}) {
  return {
    version: 2,
    profile: { name, role: '', level: 'Entry-level', years: '', location: '', skills: '', goals: '' },
    resumeText: '',
    jobs: [],
    activeJobId: null,
    src: {},
    analysis: null,
    atsBy: {},
    decoderBy: {},
    gapBy: {},
    roadmap: null,
    proofBy: {},
    tailorBy: {},
    versions: [{ id: 'master', name: 'Master resume', note: 'Your original resume', created: new Date().toISOString().slice(0, 10), text: '' }],
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
