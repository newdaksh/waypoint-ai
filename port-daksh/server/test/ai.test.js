import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { priorityOf } from '@waypoint/shared';
import { setTransport } from '../src/ai/client.js';
import { HttpError } from '../src/errors.js';
import { sampleWorkspace } from './fixtures/sampleWorkspace.js';
import { startServer } from './helpers.js';

const demo = sampleWorkspace();

// What a well-behaved model would return for each task (shaped like the design's demo data).
const canned = {
  analysis: demo.analysis,
  ats: demo.atsBy.j1,
  tailor: demo.tailorBy.j1,
  bullets: demo.bullets,
  proof: { items: demo.proofBy.j1 },
  priority: { jobs: Object.entries(demo.priorityBy).map(([id, v]) => ({ id, ...v })) },
  decoder: demo.decoderBy.j1,
  safety: { level: demo.safety.level, summary: demo.safety.summary, signals: demo.safety.signals, nextSteps: demo.safety.nextSteps },
  gap: demo.gapBy.j1,
  roadmap: { phases: demo.roadmap.phases },
  questions: { questions: demo.questions },
  eval: { score: 72.4, summary: 'Decent.', covered: ['indexes'], missing: ['EXPLAIN'], credibility: 'Medium', credibilityNote: 'Partly supported.', betterAnswer: 'Lead with the plan.' },
  claimQuestion: { question: 'Explain a service boundary you drew.', testing: 'microservices depth' },
  insights: { insights: ['Backend roles convert best.', 'Sample is small.'] },
};

describe('AI tasks (fake model)', () => {
  let s;
  let u; // the logged-in user whose workspace the tasks run against
  let seen; // requests the fake model received
  let reply; // what it answers next
  before(async () => { s = await startServer(); u = await s.signup(); });
  after(() => s.close());
  beforeEach(async () => {
    await u.seed();
    seen = [];
    reply = null;
    setTransport(async (req) => {
      seen.push(req);
      if (reply instanceof Error) throw reply;
      return typeof reply === 'string' ? reply : JSON.stringify(reply);
    });
  });
  afterEach(() => setTransport(null));

  const run = (task, body) => u.post(`/api/ai/${task}`, body);
  const ws = () => u.ws();

  it('resume-analysis stores a normalised analysis and marks it live', async () => {
    reply = { ...canned.analysis, scores: { overall: 150, ats: '88', skills: 'x', content: -4, achievements: 40.6, proof: 52 }, redFlags: [{ ...canned.analysis.redFlags[0], severity: 'catastrophic' }] };
    const r = await run('resume-analysis');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const a = (await ws()).analysis;
    assert.deepEqual(a.scores, { overall: 100, ats: 88, skills: 0, content: 0, achievements: 41, proof: 52 });
    assert.equal(a.redFlags[0].severity, 'improvement', 'unknown severity falls back');
    assert.equal((await ws()).src.analysis, 'live');
    assert.deepEqual((await ws()).claimTests, {}, 'old claim tests are cleared');
    assert.ok(r.body.patch.set.analysis, 'patch is returned for the client');
  });

  it('prompts carry only what the task needs, plus the tone', async () => {
    reply = canned.ats;
    await run('ats', { jobId: 'j1' });
    const { system, messages } = seen[0];
    assert.match(system, /analysis engine/);
    const prompt = messages[0].content;
    assert.match(prompt, /^TONE: neutral, precise analyst/);
    assert.match(prompt, /RESUME\nAarav Mehta/);
    assert.match(prompt, /JOB DESCRIPTION\nBackend Developer \(Python\) — Ledgerline/);
    assert.doesNotMatch(prompt, /Pallet Labs/, 'other jobs are not sent');
  });

  it('uses the tone preference', async () => {
    await u.patch('/api/workspace', { merge: { prefs: { aiTone: 'Coach' } } });
    reply = canned.ats;
    await run('ats', { jobId: 'j1' });
    assert.match(seen[0].messages[0].content, /^TONE: supportive career coach/);
  });

  it('per-job tasks store results under the job id and flag per-job source', async () => {
    reply = canned.ats;
    assert.equal((await run('ats', { jobId: 'j2' })).status, 200);
    assert.equal((await ws()).atsBy.j2.score, 72);
    assert.equal((await ws()).src['ats:j2'], 'live');
    assert.ok((await ws()).atsBy.j1, 'other jobs untouched');

    reply = canned.decoder; await run('decoder', { jobId: 'j2' });
    reply = canned.gap; await run('skill-gap', { jobId: 'j2' });
    reply = canned.proof; await run('skill-proof', { jobId: 'j2' });
    reply = canned.tailor; await run('tailor', { jobId: 'j2' });
    for (const k of ['decoderBy', 'gapBy', 'proofBy', 'tailorBy']) assert.ok((await ws())[k].j2, k);
  });

  it('rejects thin job descriptions before calling the model', async () => {
    await u.patch('/api/workspace', { set: { jobs: [{ id: 'jx', title: 'T', company: 'C', text: 'too short' }], activeJobId: 'jx' } });
    const r = await run('ats', { jobId: 'jx' });
    assert.equal(r.status, 400);
    assert.match(r.body.error.message, /fuller job description/);
    assert.equal(r.body.error.canRetry, false);
    assert.equal(seen.length, 0);
  });

  it('rejects unknown jobs and unknown tasks', async () => {
    assert.equal((await run('ats', { jobId: 'nope' })).status, 404);
    assert.equal((await run('constructor')).status, 404);
    assert.equal((await run('does-not-exist')).status, 404);
  });

  it('refuses over-long input instead of silently truncating', async () => {
    await u.patch('/api/workspace', { set: { resumeText: 'x'.repeat(31_000) } });
    const r = await run('resume-analysis');
    assert.equal(r.status, 400);
    assert.match(r.body.error.message, /longer than 30,000 characters/);
  });

  it('validates the short-resume case', async () => {
    await u.patch('/api/workspace', { set: { resumeText: 'too short' } });
    const r = await run('resume-analysis');
    assert.equal(r.status, 400);
    assert.match(r.body.error.message, /too short to analyze/);
  });

  it('bullets saves the bullet that was optimised', async () => {
    reply = canned.bullets;
    const r = await run('bullets', { bullet: '  Fixed bugs.  ' });
    assert.equal(r.status, 200);
    assert.equal((await ws()).bulletInput, 'Fixed bugs.');
    assert.equal((await ws()).bullets.variants.length, 4);
    assert.match(seen[0].messages[0].content, /BULLET: "Fixed bugs."/);
    assert.equal((await run('bullets', { bullet: '   ' })).status, 400);
  });

  it('priority scores every job; sub-scores combine with the shared formula', async () => {
    reply = canned.priority;
    const r = await run('priority');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(Object.keys((await ws()).priorityBy).length, 4);
    assert.equal(priorityOf((await ws()).priorityBy.j1).label, 'Apply now');
    assert.equal(priorityOf((await ws()).priorityBy.j3).label, 'Low priority');
  });

  it('safety validates, stores and returns the assessment', async () => {
    assert.equal((await run('safety', { text: 'short' })).status, 400);
    reply = canned.safety;
    const r = await run('safety', { text: 'x'.repeat(60) });
    assert.equal(r.status, 200);
    assert.equal((await ws()).safety.level, 'High risk indicators');
    assert.equal((await ws()).safetyInput, 'x'.repeat(60));
  });

  it('roadmap needs a skill-gap analysis first, then builds four phases', async () => {
    await u.patch('/api/workspace', { set: { jobs: (await ws()).jobs } }); // no-op, keeps jobs
    const noGap = await run('roadmap', { jobId: 'j2' });
    assert.equal(noGap.status, 400);
    assert.match(noGap.body.error.message, /Run Skill Gap/);

    reply = canned.roadmap;
    const r = await run('roadmap', { jobId: 'j1' });
    assert.equal(r.status, 200);
    assert.deepEqual((await ws()).roadmap.phases.map((p) => p.label), ['7-day', '30-day', '60-day', '90-day']);
    assert.ok((await ws()).roadmap.phases.every((p) => p.tasks.every((t) => t.done === false)), 'new roadmap starts unchecked');
  });

  it('interview flow: predict → evaluate answer → probe claim → check consistency', async () => {
    reply = canned.questions;
    assert.equal((await run('interview-questions', { jobId: 'j1' })).status, 200);
    assert.equal((await ws()).questions.length, 8);

    assert.equal((await run('answer-evaluation', { index: 0, answer: '  ' })).status, 400);
    assert.equal((await run('answer-evaluation', { index: 99, answer: 'a' })).status, 404);
    reply = canned.eval;
    const ev = await run('answer-evaluation', { index: 2, answer: 'Generators and context managers.' });
    assert.equal(ev.status, 200);
    assert.equal((await ws()).evals[2].score, 72);
    assert.equal((await ws()).answers[2], 'Generators and context managers.');
    assert.match(seen.at(-1).messages[0].content, /RESUME CLAIM BEING TESTED/, 'Resume-category questions test a claim');
    seen.length = 0;
    await run('answer-evaluation', { index: 0, answer: 'Use EXPLAIN ANALYZE.' });
    assert.doesNotMatch(seen[0].messages[0].content, /RESUME CLAIM BEING TESTED/);

    assert.equal((await run('claim-evaluation', { index: 1, answer: 'x' })).status, 400, 'needs a question first');
    reply = canned.claimQuestion;
    assert.equal((await run('claim-question', { index: 1 })).status, 200);
    assert.equal((await ws()).claimTests[1].testing, 'microservices depth');
    reply = canned.eval;
    assert.equal((await run('claim-evaluation', { index: 1, answer: 'I split billing out.' })).status, 200);
    assert.equal((await ws()).claimTests[1].answer, 'I split billing out.');
    assert.equal((await ws()).claimTests[1].ev.credibility, 'Medium');
  });

  it('new questions reset previous answers and scores', async () => {
    await u.patch('/api/workspace', { merge: { answers: { 0: 'old' } } });
    reply = canned.questions;
    await run('interview-questions', { jobId: 'j1' });
    assert.deepEqual((await ws()).answers, {});
    assert.deepEqual((await ws()).evals, {});
  });

  it('insights send aggregates only (no per-application companies, roles or notes)', async () => {
    reply = canned.insights;
    const r = await run('insights');
    assert.equal(r.status, 200);
    assert.deepEqual((await ws()).insights, canned.insights.insights);
    const prompt = seen[0].messages[0].content;
    assert.match(prompt, /AGGREGATED APPLICATION STATS/);
    // Resume-version labels (e.g. "v4 · Ledgerline") are user-chosen and part of the aggregate; applications are not.
    assert.doesNotMatch(prompt, /Northwind|Kitepost|Orbitly|Priya Nair|Recruiter call/);
  });

  it('tolerates fenced / chatty JSON from the model', async () => {
    reply = 'Sure! Here you go:\n```json\n' + JSON.stringify(canned.ats) + '\n```';
    assert.equal((await run('ats', { jobId: 'j1' })).status, 200);
  });

  it('retries once on unreadable output, then reports a retryable error', async () => {
    reply = 'not json at all';
    const r = await run('ats', { jobId: 'j1' });
    assert.equal(seen.length, 2, 'one retry');
    assert.equal(r.status, 502);
    assert.equal(r.body.error.canRetry, true);
    assert.match(r.body.error.message, /couldn't read/);
  });

  it('reports incomplete results with a retry', async () => {
    reply = { ...canned.ats, checks: [] };
    const r = await run('ats', { jobId: 'j1' });
    assert.equal(r.status, 502);
    assert.match(r.body.error.message, /ATS analysis came back incomplete/);
    assert.equal(r.body.error.canRetry, true);
  });

  it('surfaces transport errors with the right status and retryability', async () => {
    reply = new HttpError(429, 'Rate limit reached. Wait a minute and retry.');
    let r = await run('ats', { jobId: 'j1' });
    assert.deepEqual([r.status, r.body.error.canRetry], [429, true]);

    reply = new HttpError(503, "The AI service isn't configured.", { canRetry: false });
    r = await run('ats', { jobId: 'j1' });
    assert.deepEqual([r.status, r.body.error.canRetry], [503, false]);
  });

  it('does not clobber edits made while the model was thinking', async () => {
    reply = null;
    setTransport(async () => {
      await u.patch('/api/workspace', { set: { bulletInput: 'edited during the call' } });
      return JSON.stringify(canned.proof);
    });
    assert.equal((await run('skill-proof', { jobId: 'j1' })).status, 200);
    assert.equal((await ws()).bulletInput, 'edited during the call');
    assert.ok((await ws()).proofBy.j1.length);
  });

  describe('chat', () => {
    it('appends both turns and builds a context without contact details', async () => {
      reply = 'Focus on pytest first.';
      const r = await u.post('/api/ai/chat', { message: 'What should I learn?' });
      assert.equal(r.status, 200);
      assert.deepEqual(r.body.patch.set.chat.map((m) => m.role), ['user', 'assistant']);
      assert.equal((await ws()).chat[1].content, 'Focus on pytest first.');
      const { system, messages } = seen[0];
      assert.match(system, /career assistant/);
      assert.match(system, /PROFILE: Python Backend Developer, Junior, 1 yrs/);
      assert.doesNotMatch(system, /aarav\.mehta@email\.com|github\.com\/aaravm/, 'contact details are never shared');
      assert.deepEqual(messages, [{ role: 'user', content: 'What should I learn?' }]);
    });

    it('keeps the user message when the model call fails', async () => {
      reply = new HttpError(502, "The assistant couldn't respond. Try again.");
      const r = await u.post('/api/ai/chat', { message: 'hello?' });
      assert.equal(r.status, 502);
      assert.deepEqual((await ws()).chat.map((m) => m.content), ['hello?']);
    });

    it('sends at most the last 12 turns, starting on a user turn', async () => {
      const history = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }));
      await u.patch('/api/workspace', { set: { chat: history } });
      reply = 'ok';
      await u.post('/api/ai/chat', { message: 'latest' });
      const { messages } = seen[0];
      assert.ok(messages.length <= 12);
      assert.equal(messages[0].role, 'user');
      assert.equal(messages.at(-1).content, 'latest');
    });

    it('rejects empty and oversized messages', async () => {
      assert.equal((await u.post('/api/ai/chat', { message: '  ' })).status, 400);
      assert.equal((await u.post('/api/ai/chat', { message: 'x'.repeat(4001) })).status, 400);
    });
  });
});

describe('AI tasks for a brand-new (empty) workspace', () => {
  let s;
  let u;
  let calls;
  before(async () => { s = await startServer(); u = await s.signup(); });
  after(() => s.close());
  beforeEach(() => {
    calls = 0;
    setTransport(async () => { calls += 1; return '{}'; });
  });
  afterEach(() => setTransport(null));

  it('asks for the missing input instead of calling the model', async () => {
    const expect = async (task, body, status, message) => {
      const r = await u.post(`/api/ai/${task}`, body);
      assert.equal(r.status, status, `${task}: ${JSON.stringify(r.body)}`);
      assert.match(r.body.error.message, message, task);
      assert.equal(r.body.error.canRetry, false, task);
    };
    await expect('resume-analysis', {}, 400, /too short to analyze/);
    await expect('ats', {}, 400, /Add a target job first/);
    await expect('tailor', {}, 400, /Add a target job first/);
    await expect('decoder', {}, 400, /Add a target job first/);
    await expect('skill-gap', {}, 400, /Add a target job first/);
    await expect('skill-proof', {}, 400, /Add a target job first/);
    await expect('roadmap', {}, 400, /Add a target job first/);
    await expect('interview-questions', {}, 400, /Add a target job first/);
    await expect('priority', {}, 400, /Save at least one job first/);
    await expect('bullets', { bullet: 'Did things' }, 400, /Add your resume first/);
    await expect('safety', { text: 'short' }, 400, /Paste the full job post/);
    await expect('insights', {}, 400, /Log a few applications/);
    await expect('answer-evaluation', { index: 0, answer: 'x' }, 404, /no longer exists/);
    await expect('claim-question', { index: 0 }, 404, /no longer exists/);
    assert.equal(calls, 0, 'the model is never called when there is nothing to analyse');
  });

  it('needs the resume before a job-based analysis, with a job but no resume', async () => {
    const job = { id: 'j1', title: 'Backend Developer', company: 'Acme', location: '', category: 'Other', text: 'x'.repeat(300) };
    await u.patch('/api/workspace', { set: { jobs: [job], activeJobId: 'j1' } });
    const r = await u.post('/api/ai/ats', { jobId: 'j1' });
    assert.equal(r.status, 400);
    assert.match(r.body.error.message, /Add your resume first/);
    assert.equal(calls, 0);
  });

  it('the assistant works even with nothing set up yet', async () => {
    setTransport(async ({ system }) => (system.includes('target role not set') ? 'Start by adding your resume.' : 'unexpected context'));
    const r = await u.post('/api/ai/chat', { message: 'Where do I start?' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.patch.set.chat.at(-1).content, 'Start by adding your resume.');
  });
});
