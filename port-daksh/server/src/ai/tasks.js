import { analytics } from '@waypoint/shared';
import { HttpError } from '../errors.js';
import { completeJson, completeText } from './client.js';
import { chatContext, ctxProfile, tone } from './context.js';
import { arr, list, n, one, str } from './sanitize.js';

/**
 * One handler per AI task. Each receives the stored workspace plus the (validated) request body and
 * returns a workspace patch — it never mutates anything itself. The route persists the patch and
 * sends it back so the client applies exactly what the server stored.
 *
 * Inputs are never silently truncated: text over the limits below is rejected with a clear message.
 */

const LIMITS = { resume: 30_000, job: 20_000, text: 20_000, answer: 8_000, bullet: 2_000 };

const within = (text, max, what) => {
  if (text.length > max) throw new HttpError(400, `${what} is longer than ${max.toLocaleString('en-US')} characters. Shorten it and try again.`);
  return text;
};
/** The master resume, which every analysis needs. */
const resumeOf = (ws) => {
  if (ws.resumeText.trim().length < 100) throw new HttpError(400, 'Add your resume first: paste it under Profile & resume.');
  return within(ws.resumeText, LIMITS.resume, 'Your resume text');
};
const incomplete = (what) => new HttpError(502, `The ${what} came back incomplete. Retry usually fixes this.`, { canRetry: true });
const live = (...keys) => Object.fromEntries(keys.map((k) => [k, 'live']));

function jobOf(ws, jobId) {
  if (!ws.jobs.length) throw new HttpError(400, 'Add a target job first under Saved Jobs & Priority.');
  const job = ws.jobs.find((j) => j.id === (jobId || ws.activeJobId));
  if (!job) throw new HttpError(404, 'That job no longer exists. Pick another target job.');
  return job;
}

/** The job's description, which must be substantial enough to analyse. */
function descriptionOf(job) {
  const text = job.text || '';
  if (text.trim().length < 150) throw new HttpError(400, 'Paste a fuller job description for the target job first.');
  return within(text, LIMITS.job, 'The job description');
}

function indexOf(value, what) {
  const i = Number(value);
  if (!Number.isInteger(i) || i < 0) throw new HttpError(400, `Missing ${what}.`);
  return i;
}

const ai = (ws, prompt, max) => completeJson(`${tone(ws.prefs?.aiTone)}\n\n${prompt}`, max);

// ───────────────────────────────────────────────── resume

async function resumeAnalysis(ws) {
  const text = ws.resumeText.trim();
  if (text.length < 200) throw new HttpError(400, 'Resume text looks too short to analyze (under 200 characters).');
  within(text, LIMITS.resume, 'Your resume text');

  const r = await ai(
    ws,
    `PROFILE\n${ctxProfile(ws.profile)}\n\nRESUME\n${text}\n\nReturn JSON:\n{"summary":2 sentences,"scores":{"overall":0-100,"ats":0-100 formatting/parsing readiness,"skills":0-100,"content":0-100,"achievements":0-100 measurable outcomes,"proof":0-100 share of claimed skills backed by roles/projects},"strengths":[3 strings],"redFlags":[4-8 of {"severity":"critical"|"warning"|"improvement","title","quote":exact short excerpt,"problem","why","fix"}],"skillLevels":[{"skill":from resume only,"level":"strong"|"intermediate"|"weak"}],"claims":[3-5 of {"claim":exact resume claim,"evidence":"where supported or None found","risk":"Low"|"Medium"|"High"}],"actions":[3-4 of {"title","why","action","impact":"High"|"Medium"|"Low","module":"Bullet Optimizer"|"Skill-Proof"|"Interview Predictor"|"Learning Roadmap"|"Resume Tailor"}]}`,
    3500,
  );
  const sc = r.scores || {};
  const analysis = {
    summary: str(r.summary),
    scores: { overall: n(sc.overall), ats: n(sc.ats), skills: n(sc.skills), content: n(sc.content), achievements: n(sc.achievements), proof: n(sc.proof) },
    strengths: list(r.strengths).slice(0, 4),
    redFlags: arr(r.redFlags).map((f) => ({
      severity: one(f.severity, ['critical', 'warning', 'improvement'], 'improvement'),
      title: str(f.title), quote: str(f.quote), problem: str(f.problem), why: str(f.why), fix: str(f.fix),
    })),
    skillLevels: arr(r.skillLevels).map((k) => ({ skill: str(k.skill), level: one(k.level, ['strong', 'intermediate', 'weak'], 'weak') })),
    claims: arr(r.claims).map((c) => ({ claim: str(c.claim), evidence: str(c.evidence) || 'None found', risk: one(c.risk, ['Low', 'Medium', 'High'], 'Medium') })),
    actions: arr(r.actions).slice(0, 4).map((x) => ({
      title: str(x.title), why: str(x.why), action: str(x.action),
      impact: one(x.impact, ['High', 'Medium', 'Low'], 'Medium'),
      module: str(x.module) || 'Resume Tailor',
    })),
  };
  if (!analysis.summary || !analysis.redFlags.length) throw incomplete('analysis');
  // A new analysis invalidates any previously tested resume claims.
  return { set: { analysis, claimTests: {} }, merge: { src: live('analysis') } };
}

async function ats(ws, { jobId }) {
  const job = jobOf(ws, jobId);
  const jd = descriptionOf(job);
  const r = await ai(
    ws,
    `RESUME\n${resumeOf(ws)}\n\nJOB DESCRIPTION\n${jd}\n\nSimulate a typical ATS evaluation. Return JSON:\n{"score":0-100,"keywordCoverage":0-100,"jobFit":0-100,"titleAlignment":1 sentence,"summary":2 sentences,"matched":[JD keywords present, max 12],"missing":[important JD keywords absent, max 10],"checks":[5-7 of {"label","status":"pass"|"risk"|"fail","note"}]}`,
    2500,
  );
  const v = {
    score: n(r.score), keywordCoverage: n(r.keywordCoverage), jobFit: n(r.jobFit),
    titleAlignment: str(r.titleAlignment), summary: str(r.summary),
    matched: list(r.matched).slice(0, 14), missing: list(r.missing).slice(0, 12),
    checks: arr(r.checks).map((c) => ({ label: str(c.label), status: one(c.status, ['pass', 'risk', 'fail'], 'risk'), note: str(c.note) })),
  };
  if (!v.checks.length) throw incomplete('ATS analysis');
  return { merge: { atsBy: { [job.id]: v }, src: { ats: 'live', [`ats:${job.id}`]: 'live' } } };
}

async function tailor(ws, { jobId }) {
  const job = jobOf(ws, jobId);
  const jd = descriptionOf(job);
  const r = await ai(
    ws,
    `MASTER RESUME\n${resumeOf(ws)}\n\nTARGET JOB\n${jd}\n\nRewrite the resume for this job. You may reorder, clarify, tighten wording, and emphasise relevant truthful content. You must NOT add any experience, company, title, technology, certification, achievement or metric that isn't in the master resume. Return JSON:\n{"text":full tailored resume as plain text,"changes":[3-6 of {"section","change","reason"}],"notIncluded":[JD requirements you did not add because the resume has no evidence]}`,
    4000,
  );
  if (!r.text || String(r.text).length < 200) throw incomplete('tailored resume');
  const v = {
    text: str(r.text),
    changes: arr(r.changes).map((c) => ({ section: str(c.section), change: str(c.change), reason: str(c.reason) })),
    notIncluded: list(r.notIncluded),
  };
  return { merge: { tailorBy: { [job.id]: v }, src: { tailor: 'live', [`tailor:${job.id}`]: 'live' } } };
}

async function bullets(ws, body) {
  const bullet = str(body.bullet ?? ws.bulletInput).trim();
  if (!bullet) throw new HttpError(400, 'Enter a bullet to optimize.');
  within(bullet, LIMITS.bullet, 'The bullet');
  const job = ws.jobs.find((j) => j.id === (body.jobId || ws.activeJobId)) || ws.jobs[0];
  const jd = within(job?.text || '', LIMITS.job, 'The job description');

  const r = await ai(
    ws,
    `RESUME (facts available)\n${resumeOf(ws)}\n\nTARGET JOB (for emphasis only)\n${jd}\n\nBULLET: "${bullet}"\n\nWrite 4 improved versions using only facts in the resume. Never invent numbers; use [number] placeholders where a real metric would help. Return JSON:\n{"variants":[{"style":"ATS-focused"},{"style":"Achievement-focused"},{"style":"Technical"},{"style":"Concise"}] each with "text" and "note","metricPrompts":[3 questions asking the user for real metrics]}`,
    1500,
  );
  const variants = arr(r.variants).map((v) => ({ style: str(v.style), text: str(v.text), note: str(v.note) })).filter((v) => v.text);
  if (!variants.length) throw new HttpError(502, 'No variants came back. Retry usually fixes this.', { canRetry: true });
  return { set: { bullets: { variants, metricPrompts: list(r.metricPrompts) }, bulletInput: bullet }, merge: { src: live('bullets') } };
}

async function skillProof(ws, { jobId }) {
  const job = jobOf(ws, jobId);
  const jd = descriptionOf(job);
  const r = await ai(
    ws,
    `RESUME\n${resumeOf(ws)}\n\nJOB\n${jd}\n\nFor the 6-8 most important skills (claimed on the resume or required by the job), ask "where is the proof?". Return JSON:\n{"items":[{"skill","status":"Proven"|"Partial"|"Unproven","evidence":existing evidence from resume or "None","gap","proof":recommended proof,"idea":project idea or ""}]}`,
    2500,
  );
  const items = arr(r.items).map((p) => ({
    skill: str(p.skill), status: one(p.status, ['Proven', 'Partial', 'Unproven'], 'Partial'),
    evidence: str(p.evidence), gap: str(p.gap), proof: str(p.proof), idea: str(p.idea),
  }));
  if (!items.length) throw new HttpError(502, 'No results came back. Retry usually fixes this.', { canRetry: true });
  return { merge: { proofBy: { [job.id]: items }, src: { proof: 'live', [`proof:${job.id}`]: 'live' } } };
}

// ───────────────────────────────────────────────── jobs

async function priority(ws) {
  const jobs = ws.jobs;
  if (!jobs.length) throw new HttpError(400, 'Save at least one job first.');
  const jobList = jobs.map((j) => `ID ${j.id}: ${j.title} at ${j.company}\n${(j.text || '').slice(0, 12_000)}`).join('\n\n---\n\n');
  const r = await ai(
    ws,
    `PROFILE\n${ctxProfile(ws.profile)}\n\nRESUME\n${resumeOf(ws)}\n\nJOBS\n${jobList}\n\nScore each job. Return JSON:\n{"jobs":[{"id","resume":0-100 overall resume match,"skill":0-100 required-skill match,"experience":0-100,"goal":0-100 alignment with career goals,"effort":"Low"|"Medium"|"High" learning effort to be competitive,"reason":1 sentence}]}`,
    Math.min(10_000, 800 + jobs.length * 220),
  );
  const out = {};
  for (const j of arr(r.jobs)) {
    if (!jobs.some((x) => x.id === j.id)) continue;
    out[j.id] = { resume: n(j.resume), skill: n(j.skill), experience: n(j.experience), goal: n(j.goal), effort: one(j.effort, ['Low', 'Medium', 'High'], 'Medium'), reason: str(j.reason) };
  }
  if (!Object.keys(out).length) throw incomplete('job scoring');
  return { merge: { priorityBy: out, src: live('priority') } };
}

async function decoder(ws, { jobId }) {
  const job = jobOf(ws, jobId);
  const jd = descriptionOf(job);
  const r = await ai(
    ws,
    `JOB\n${jd}\n\nCANDIDATE RESUME (for suitability only)\n${resumeOf(ws)}\n\nExplain this job in plain language. Return JSON:\n{"summary":1-2 sentences,"reallyWants":2 sentences,"mustHave":[],"niceToHave":[],"responsibilities":[],"experience":1 sentence,"seniority":short,"interviewFocus":[3-4],"hiddenSignals":[2-4 inferences from wording, phrased as likely not certain],"suitability":2 sentences}`,
    2000,
  );
  if (!r.summary) throw incomplete('decoder');
  const v = {
    summary: str(r.summary), reallyWants: str(r.reallyWants),
    mustHave: list(r.mustHave), niceToHave: list(r.niceToHave), responsibilities: list(r.responsibilities),
    experience: str(r.experience), seniority: str(r.seniority),
    interviewFocus: list(r.interviewFocus), hiddenSignals: list(r.hiddenSignals), suitability: str(r.suitability),
  };
  return { merge: { decoderBy: { [job.id]: v }, src: { decoder: 'live', [`decoder:${job.id}`]: 'live' } } };
}

async function safety(ws, body) {
  const text = str(body.text ?? ws.safetyInput).trim();
  if (text.length < 40) throw new HttpError(400, 'Paste the full job post or message to assess.');
  within(text, LIMITS.text, 'The text');
  const r = await ai(
    ws,
    `CONTENT TO ASSESS\n${text}\n\nAssess recruitment-fraud risk indicators: payment requests, unrealistic salary, urgency, suspicious contact info, missing company details, sensitive info requests, unusual process, inconsistencies. This is a risk assessment, never a verdict. Return JSON:\n{"level":"Low apparent risk"|"Moderate risk indicators"|"High risk indicators","summary":2 sentences,"signals":[{"signal","severity":"High"|"Medium"|"Low","quote":exact excerpt,"explain"}],"nextSteps":[3-4]}`,
    1800,
  );
  const result = {
    level: one(r.level, ['Low apparent risk', 'Moderate risk indicators', 'High risk indicators'], 'Moderate risk indicators'),
    summary: str(r.summary),
    signals: arr(r.signals).map((s) => ({ signal: str(s.signal), severity: one(s.severity, ['High', 'Medium', 'Low'], 'Medium'), quote: str(s.quote), explain: str(s.explain) })),
    nextSteps: list(r.nextSteps),
  };
  return { set: { safety: result, safetyInput: text }, merge: { src: live('safety') } };
}

// ───────────────────────────────────────────────── skills

async function skillGap(ws, { jobId }) {
  const job = jobOf(ws, jobId);
  const jd = descriptionOf(job);
  const r = await ai(
    ws,
    `RESUME\n${resumeOf(ws)}\n\nJOB\n${jd}\n\nCompare skills. Return JSON:\n{"have":[],"missing":[],"strengthen":[]} where each item is {"skill","priority":"Must Have"|"Important"|"Nice to Have","evidence":exact short quote from the JD,"note":1 short sentence about the resume evidence}`,
    2500,
  );
  const items = (x) =>
    arr(x).map((g) => ({ skill: str(g.skill), priority: one(g.priority, ['Must Have', 'Important', 'Nice to Have'], 'Important'), evidence: str(g.evidence), note: str(g.note) }));
  const v = { have: items(r.have), missing: items(r.missing), strengthen: items(r.strengthen) };
  if (!v.have.length && !v.missing.length) throw new HttpError(502, 'The skill-gap analysis came back empty. Retry usually fixes this.', { canRetry: true });
  return { merge: { gapBy: { [job.id]: v }, src: { gap: 'live', [`gap:${job.id}`]: 'live' } } };
}

const PHASES = { 7: '7-day', 30: '30-day', 60: '60-day', 90: '90-day' };

async function roadmap(ws, { jobId }) {
  const job = jobOf(ws, jobId);
  const g = ws.gapBy[job.id];
  if (!g) throw new HttpError(400, 'Run Skill Gap for this job first. The roadmap is built from those gaps.');
  const gaps = [...g.missing, ...g.strengthen].map((x) => `${x.skill} (${x.priority})`).join(', ');
  const r = await ai(
    ws,
    `PROFILE\n${ctxProfile(ws.profile)}\n\nSKILL GAPS FOR ${job.title} at ${job.company}: ${gaps}\n\nBuild a learning roadmap. Return JSON:\n{"phases":[{"key":"7","tasks":[2 tasks]},{"key":"30","tasks":[2]},{"key":"60","tasks":[2]},{"key":"90","tasks":[2]}]} where each task is {"topic","why","difficulty":"Easy"|"Medium"|"Hard","hours":number,"objective","practice","project","questions":[2 interview questions]}`,
    3500,
  );
  const phases = Object.entries(PHASES).map(([key, label]) => {
    const p = arr(r.phases).find((x) => String(x.key) === key) || { tasks: [] };
    return {
      key, label,
      tasks: arr(p.tasks).map((t) => ({
        topic: str(t.topic), why: str(t.why), difficulty: one(t.difficulty, ['Easy', 'Medium', 'Hard'], 'Medium'),
        hours: Number(t.hours) || 0, objective: str(t.objective), practice: str(t.practice), project: str(t.project),
        questions: list(t.questions), done: false,
      })),
    };
  });
  if (!phases.some((p) => p.tasks.length)) throw new HttpError(502, 'The roadmap came back empty. Retry usually fixes this.', { canRetry: true });
  return { set: { roadmap: { jobId: job.id, phases } }, merge: { src: live('roadmap') } };
}

// ───────────────────────────────────────────────── interview

const QUESTION_CATEGORIES = ['Technical', 'Resume', 'Project', 'Behavioral', 'HR', 'Role-specific'];

async function interviewQuestions(ws, { jobId }) {
  const job = jobOf(ws, jobId);
  const jd = descriptionOf(job);
  const r = await ai(
    ws,
    `RESUME\n${resumeOf(ws)}\n\nJOB\n${jd}\n\nPredict 9 interview questions, at least one each of Technical, Resume, Project, Behavioral, HR, Role-specific. Return JSON:\n{"questions":[{"category","question","difficulty":"Easy"|"Medium"|"Hard","why","expect":[3],"followups":[2]}]}`,
    3500,
  );
  const questions = arr(r.questions)
    .map((q) => ({
      category: one(q.category, QUESTION_CATEGORIES, 'Technical'), question: str(q.question),
      difficulty: one(q.difficulty, ['Easy', 'Medium', 'Hard'], 'Medium'), why: str(q.why),
      expect: list(q.expect), followups: list(q.followups),
    }))
    .filter((q) => q.question);
  if (!questions.length) throw new HttpError(502, 'No questions came back. Retry usually fixes this.', { canRetry: true });
  // New questions invalidate answers and scores for the old ones.
  return { set: { questions, answers: {}, evals: {} }, merge: { src: live('questions') } };
}

/** Score an answer; `claim` is set when the question tests a specific resume claim. */
async function evaluate(ws, question, answer, claim) {
  const r = await ai(
    ws,
    `RESUME (context)\n${resumeOf(ws)}\n\n${claim ? `RESUME CLAIM BEING TESTED: "${claim}"\n` : ''}QUESTION: ${question}\n\nANSWER:\n${answer}\n\nEvaluate. Return JSON:\n{"score":0-100,"summary":1-2 sentences,"covered":[],"missing":[],"credibility":"Low"|"Medium"|"High" risk that the answer doesn't support the level implied by the resume,"credibilityNote":1-2 sentences; if unsupported, use wording like "Your answer does not currently demonstrate the level of knowledge implied by this resume claim." Never say the candidate is lying.,"betterAnswer":1 sentence structure using only resume facts}`,
    1500,
  );
  return {
    score: n(r.score), summary: str(r.summary), covered: list(r.covered), missing: list(r.missing),
    credibility: one(r.credibility, ['Low', 'Medium', 'High'], 'Medium'),
    credibilityNote: str(r.credibilityNote), betterAnswer: str(r.betterAnswer),
  };
}

const answerOf = (body) => {
  const answer = str(body.answer).trim();
  if (!answer) throw new HttpError(400, 'Write an answer first.');
  return within(answer, LIMITS.answer, 'Your answer');
};

async function answerEvaluation(ws, body) {
  const i = indexOf(body.index, 'question');
  const q = ws.questions?.[i];
  if (!q) throw new HttpError(404, 'That question no longer exists. Predict questions again.');
  const answer = answerOf(body);
  const ev = await evaluate(ws, q.question, answer, q.category === 'Resume' ? q.question : null);
  return { merge: { evals: { [i]: ev }, answers: { [i]: answer } } };
}

async function claimQuestion(ws, body) {
  const i = indexOf(body.index, 'claim');
  const c = ws.analysis?.claims?.[i];
  if (!c) throw new HttpError(404, 'That claim no longer exists. Re-analyze your resume first.');
  const r = await ai(
    ws,
    `RESUME\n${resumeOf(ws)}\n\nCLAIM: "${c.claim}"\n\nWrite ONE interview question that tests the knowledge this claim implies, at the depth it implies. Return JSON: {"question","testing":short phrase}`,
    500,
  );
  if (!r.question) throw new HttpError(502, 'No question came back. Retry usually fixes this.', { canRetry: true });
  return { merge: { claimTests: { [i]: { question: str(r.question), testing: str(r.testing), answer: '' } } } };
}

async function claimEvaluation(ws, body) {
  const i = indexOf(body.index, 'claim');
  const c = ws.analysis?.claims?.[i];
  const t = ws.claimTests?.[i];
  if (!c || !t?.question) throw new HttpError(400, 'Generate a probing question for this claim first.');
  const answer = answerOf(body);
  const ev = await evaluate(ws, t.question, answer, c.claim);
  return { merge: { claimTests: { [i]: { ...t, answer, ev } } } };
}

// ───────────────────────────────────────────────── analytics + assistant

async function insights(ws) {
  const st = analytics(ws.apps, ws.versions);
  if (!st.sent) throw new HttpError(400, 'Log a few applications in the tracker first.');
  const agg = {
    sent: st.sent, interviews: st.interviews, offers: st.offers, rejections: st.rejections,
    responseRate: st.responseRate, interviewRate: st.interviewRate, avgMatch: st.avgMatch,
    byVersion: st.byVersion.map((g) => ({ version: g.name, apps: g.n, interviews: g.interviews })),
    byMatch: st.byMatch, byCategory: st.byCat,
  };
  const r = await ai(
    ws,
    `AGGREGATED APPLICATION STATS (no personal data)\n${JSON.stringify(agg)}\n\nGive 3-4 insights grounded only in these numbers, with one suggested action each. Mention when sample sizes are too small to be reliable. Return JSON: {"insights":[strings]}`,
    1000,
  );
  const result = list(r.insights);
  if (!result.length) throw incomplete('insights');
  return { set: { insights: result } };
}

/** `chat` is special: it persists the user's message before calling the model (see routes/ai.js). */
export const CHAT_HISTORY_WINDOW = 12;

export async function chatReply(ws) {
  const system = `You are Waypoint's career assistant. ${tone(ws.prefs?.aiTone)}\nUse only the context below and the conversation. Never invent experience, metrics or certifications; if you suggest resume wording, use only facts present. Scores are estimates, never guarantees. Be concise: under 180 words, short paragraphs or brief lists, plain text without markdown headings.\n\nCONTEXT\n${chatContext(ws)}`;
  const messages = ws.chat.slice(-CHAT_HISTORY_WINDOW).map((m) => ({ role: m.role, content: m.content }));
  while (messages.length && messages[0].role !== 'user') messages.shift(); // the API requires the first turn to be the user's
  return completeText({ system, messages, maxTokens: 900 });
}

export const tasks = {
  'resume-analysis': resumeAnalysis,
  ats,
  tailor,
  bullets,
  'skill-proof': skillProof,
  priority,
  decoder,
  safety,
  'skill-gap': skillGap,
  roadmap,
  'interview-questions': interviewQuestions,
  'answer-evaluation': answerEvaluation,
  'claim-question': claimQuestion,
  'claim-evaluation': claimEvaluation,
  insights,
};
