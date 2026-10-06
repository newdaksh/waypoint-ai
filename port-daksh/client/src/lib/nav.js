/** Sidebar structure: [group label, [[item label, route], …]]. */
export const NAV = [
  ['Overview', [['Dashboard', '/app/dashboard'], ['Profile', '/app/profile'], ['Resumes', '/app/resumes'], ['Target jobs', '/app/targets']]],
  ['Resume Intelligence', [
    ['Resume Analyzer', '/app/resume'],
    ['ATS Analyzer', '/app/resume/ats'],
    ['Resume Tailor', '/app/tailor'],
    ['Bullet Optimizer', '/app/bullets'],
    ['Skill-Proof Generator', '/app/proof'],
  ]],
  ['Job Intelligence', [['Saved Jobs & Priority', '/app/jobs'], ['Job Decoder', '/app/decoder'], ['Job Safety Analyzer', '/app/safety']]],
  ['Skill Intelligence', [['Skill Gap', '/app/gap'], ['Learning Roadmap', '/app/roadmap']]],
  ['Interview Intelligence', [['Live Interview', '/app/live'], ['Interview Predictor', '/app/interview/practice'], ['Consistency Check', '/app/interview/consistency']]],
  ['Career Intelligence', [['Application Tracker', '/app/tracker'], ['Analytics', '/app/analytics'], ['AI Career Assistant', '/app/assistant']]],
];

export const RESUME_TABS = ['health', 'flags', 'ats'];
export const INTERVIEW_TABS = ['practice', 'consistency'];

/** Is this nav item the current page? (Resume and Interview share a route with different tabs.) */
export function isNavActive(route, pathname) {
  const [, , screen, tab] = route.split('/');
  const [, , curScreen, curTab] = pathname.split('/');
  if (screen !== curScreen) return false;
  if (screen === 'resume') return tab === 'ats' ? curTab === 'ats' : curTab !== 'ats';
  if (screen === 'interview') return tab === curTab;
  return true;
}

/** [crumb, title, description] for the page header. */
export function pageMeta(pathname) {
  const [, , screen, tab] = pathname.split('/');
  const ats = tab === 'ats';
  const consistency = tab === 'consistency';
  const pages = {
    profile: ['Get started', 'Profile', 'Who you are and where you want to go. Context for every analysis.'],
    resumes: ['Get started', 'Resumes', 'Every resume you keep. The one you select is the one all the tools use.'],
    targets: ['Get started', 'Target jobs', 'The jobs you are aiming for. The one you select is the one all the tools compare against.'],
    dashboard: ['Career Intelligence', 'Dashboard', 'Where you stand for your target role, and what to do next.'],
    resume: [
      'Resume Intelligence',
      ats ? 'ATS Analyzer' : 'Resume Analyzer',
      ats ? 'How a typical applicant tracking system might read your resume for this job.' : 'Health, red flags and evidence in your resume.',
    ],
    tailor: ['Resume Intelligence', 'Resume Tailor', 'A version of your resume focused on one job, built only from what you wrote.'],
    bullets: ['Resume Intelligence', 'Bullet Optimizer', 'Turn one weak bullet into stronger, truthful versions.'],
    proof: ['Resume Intelligence', 'Skill-Proof Generator', 'For every important skill: where is your proof?'],
    jobs: ['Job Intelligence', 'Saved Jobs & Priority', 'Which jobs to apply to first, and why.'],
    decoder: ['Job Intelligence', 'Job Decoder', 'What this posting is really asking for, in plain language.'],
    safety: ['Job Intelligence', 'Job Safety Analyzer', 'Check a job post or recruiter message for common warning signs.'],
    gap: ['Skill Intelligence', 'Skill Gap', "Skills you have, skills you're missing, and skills to strengthen for this job."],
    roadmap: ['Skill Intelligence', 'Learning Roadmap', 'A 7, 30, 60 and 90-day plan built from your gaps.'],
    interview: [
      'Interview Intelligence',
      consistency ? 'Consistency Check' : 'Interview Predictor',
      consistency ? 'Test whether your answers support what your resume claims.' : 'Likely questions for this job, with practice and feedback.',
    ],
    live: [
      'Interview Intelligence',
      tab ? 'Interview report' : 'Live Interview',
      tab ? 'Your score, answer-by-answer feedback and what to practise next.' : 'Talk with an AI interviewer in real time, built from one resume and one job.',
    ],
    tracker: ['Career Intelligence', 'Application Tracker', 'Every application, its status, resume version and notes.'],
    analytics: ['Career Intelligence', 'Analytics', 'What your applications are telling you so far.'],
    assistant: ['Career Intelligence', 'AI Career Assistant', 'Ask questions about your resume, jobs, interviews and plan.'],
  };
  const [crumb, title, desc] = pages[screen] || ['', '', ''];
  const jobScreens = ['tailor', 'proof', 'decoder', 'gap', 'roadmap', 'interview', 'bullets', 'dashboard'];
  return {
    screen, tab, crumb, title, desc,
    needsJob: jobScreens.includes(screen) || (screen === 'resume' && ats),
    usesResume: [...jobScreens, 'resume', 'jobs'].includes(screen), // their results are made from the active resume
  };
}
