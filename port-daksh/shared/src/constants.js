export const STATUSES = ['Saved', 'Applied', 'Screening', 'Interview', 'Technical Round', 'HR Round', 'Offer', 'Rejected', 'Withdrawn'];

// How far through the pipeline each status counts. Rejected / Withdrawn don't advance a stage.
export const STAGE = { Saved: 0, Applied: 1, Screening: 2, Interview: 3, 'Technical Round': 3, 'HR Round': 3, Offer: 4 };

export const CAREER_LEVELS = ['Student', 'Entry-level', 'Junior', 'Mid-level', 'Senior'];

export const ACCENTS = ['Indigo', 'Emerald', 'Graphite', 'Violet'];
export const SIDEBARS = ['Ink', 'Light'];
export const AI_TONES = ['Analyst', 'Coach', 'Recruiter'];

export const DEFAULT_PREFS = { accent: 'Indigo', sidebar: 'Ink', aiTone: 'Analyst' };

/**
 * Ids used as keys inside workspace maps (jobs, applications, answers…). They become MongoDB field
 * paths ("answers.3"), so '.' and '$' must never appear.
 */
export const ENTRY_ID = /^[A-Za-z0-9_:-]{1,80}$/;
