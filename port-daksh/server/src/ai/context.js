import { activeResumeOf, analytics, priorityOf } from '@waypoint/shared';

const TONES = {
  Analyst: 'TONE: neutral, precise analyst. Short sentences, no encouragement filler.',
  Coach: 'TONE: supportive career coach. Warm and encouraging, but still specific and honest about gaps.',
  Recruiter: 'TONE: candid technical recruiter. Frame everything by how a hiring panel would read it.',
};

/** Style instruction chosen in the user's preferences ("AI behavior → tone"). */
export const tone = (name) => TONES[name] || TONES.Analyst;

/** The slice of the profile every analysis is given as context. */
export const ctxProfile = (p) => `Target role: ${p.role}\nCareer level: ${p.level}\nYears of experience: ${p.years}\nGoals: ${p.goals}`;

/**
 * What the career assistant is allowed to see: scores, skills, saved jobs, application results and
 * the roadmap — never contact details or the full resume text (only a few experience bullets).
 */
export function chatContext(ws) {
  const a = ws.analysis;
  const activeJob = ws.jobs.find((j) => j.id === ws.activeJobId) || ws.jobs[0];
  const ats = activeJob ? ws.atsBy[activeJob.id] : null;
  const stats = analytics(ws.apps, ws.resumes);

  const jobs = ws.jobs
    .map((j) => {
      const p = priorityOf(ws.priorityBy[j.id]);
      return `- ${j.title} at ${j.company}${p ? ` (score ${p.score}, ${p.label})` : ''}`;
    })
    .join('\n');
  const roadmap = ws.roadmap
    ? ws.roadmap.phases.flatMap((p) => p.tasks.map((x) => `${p.label}: ${x.topic}${x.done ? ' (done)' : ''}`)).join('; ')
    : 'none';
  const scores = Object.values(ws.evals || {}).map((e) => e.score);
  const bullets = activeResumeOf(ws).text
    .split('\n')
    .filter((l) => l.trim().startsWith('-'))
    .slice(0, 8)
    .join(' ');

  return [
    `PROFILE: ${ws.profile.role || 'target role not set'}, ${ws.profile.level}, ${ws.profile.years || '?'} yrs. Goals: ${ws.profile.goals || 'not set'}`,
    `RESUME SCORES: ${a ? JSON.stringify(a.scores) : 'not analyzed'}`,
    `RESUME RED FLAGS: ${a ? a.redFlags.map((f) => f.title).join('; ') : 'n/a'}`,
    `RESUME SKILLS: ${a ? a.skillLevels.map((k) => `${k.skill} (${k.level})`).join(', ') : 'n/a'}`,
    `RESUME EXPERIENCE (excerpt): ${bullets}`,
    `ACTIVE TARGET JOB: ${activeJob ? `${activeJob.title} at ${activeJob.company}` : 'none'}. ATS: ${ats ? `score ${ats.score}, missing ${ats.missing.join(', ')}` : 'not run'}`,
    `SAVED JOBS:\n${jobs}`,
    `APPLICATIONS: ${stats.sent} sent, ${stats.interviews} interviews, ${stats.offers} offers. By version: ${stats.byVersion.map((g) => `${g.name} ${g.interviews}/${g.n}`).join(', ')}`,
    `ROADMAP: ${roadmap}`,
    `INTERVIEW PRACTICE: ${scores.length ? `${scores.length} answers, avg ${Math.round(scores.reduce((x, y) => x + y, 0) / scores.length)}` : 'none yet'}`,
  ].join('\n');
}
