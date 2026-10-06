import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { assertAiConfigured } from '../ai/client.js';
import { HttpError } from '../errors.js';
import { toPublic, toSummary } from '../live/repo.js';

const LIMITS = { resume: 30_000, job: 20_000, label: 200 };
const ID = /^[A-Za-z0-9_-]{1,64}$/;

const notFound = () => new HttpError(404, 'That interview no longer exists.', { canRetry: false });

/**
 *   GET    /api/interviews            the user's interviews, newest first (no transcripts)
 *   POST   /api/interviews            { resumeId, jobId } → prepare a live interview
 *   GET    /api/interviews/:id        one interview with transcript, questions and report (poll for the report)
 *   POST   /api/interviews/:id/end    finish an interview (also one whose browser connection is gone)
 *   POST   /api/interviews/:id/report retry a failed report
 *   DELETE /api/interviews/:id        delete an interview
 *
 * The voice itself runs over a WebSocket (`/api/live/:id`, see live/service.js). Everything here is scoped to the
 * logged-in user: someone else's interview id answers "not found".
 */
export function interviewRoutes({ repo, service, limits = {} }) {
  const router = Router();

  // Starting an interview costs real audio minutes: cap how fast one person can start them. `limits.disabled` is for tests.
  const startLimiter = rateLimit({
    windowMs: 10 * 60_000,
    limit: 12,
    skip: () => Boolean(limits.disabled),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { message: 'You have started a lot of interviews in a short time. Wait a few minutes and try again.', canRetry: true } },
  });

  const owned = async (req) => {
    if (!ID.test(req.params.id)) throw notFound();
    const doc = await repo.get(req.user.id, req.params.id);
    if (!doc) throw notFound();
    return service.reconcile(req.user.id, doc);
  };

  router.get('/', async (req, res) => {
    const docs = await Promise.all((await repo.list(req.user.id)).map((d) => service.reconcile(req.user.id, d)));
    res.json({ interviews: docs.map(toSummary), limits: service.limits() });
  });

  router.post('/', startLimiter, async (req, res) => {
    const { resumeId, jobId } = req.body && typeof req.body === 'object' ? req.body : {};
    if (typeof resumeId !== 'string' || typeof jobId !== 'string') throw new HttpError(400, 'Choose a resume and a target job first.', { canRetry: false });
    assertAiConfigured();

    // The interview runs on what is stored now, never on text sent by the browser.
    const ws = await req.workspace.read();
    const resume = ws.resumes.find((r) => r.id === resumeId);
    const job = ws.jobs.find((j) => j.id === jobId);
    if (!resume) throw new HttpError(404, 'That resume no longer exists. Pick another one.', { canRetry: false });
    if (!job) throw new HttpError(404, 'That job no longer exists. Pick another one.', { canRetry: false });

    const resumeText = resume.text.trim();
    const jobText = String(job.text || '').trim();
    if (resumeText.length < 100) throw new HttpError(400, 'This resume looks empty. Add your resume text under Resumes, or pick another one.', { canRetry: false, field: 'resume' });
    if (resumeText.length > LIMITS.resume) throw new HttpError(400, `This resume is longer than ${LIMITS.resume.toLocaleString('en-US')} characters. Shorten it and try again.`, { canRetry: false, field: 'resume' });
    if (jobText.length < 150) throw new HttpError(400, 'Paste a fuller job description for this job first: the interview is built from it.', { canRetry: false, field: 'job' });
    if (jobText.length > LIMITS.job) throw new HttpError(400, `This job description is longer than ${LIMITS.job.toLocaleString('en-US')} characters. Shorten it and try again.`, { canRetry: false, field: 'job' });

    await repo.removeUnstarted(req.user.id);
    const doc = await repo.create({
      userId: req.user.id,
      resume: { id: resume.id, name: String(resume.name).slice(0, LIMITS.label) },
      job: { id: job.id, title: String(job.title || 'the role').slice(0, LIMITS.label), company: String(job.company || 'the company').slice(0, LIMITS.label) },
      snapshot: {
        resumeText,
        jobText,
        candidate: { name: ws.profile.name || req.user.name, role: ws.profile.role, level: ws.profile.level, years: ws.profile.years },
        tone: ws.prefs?.aiTone,
      },
    });
    res.status(201).json({ interview: toSummary(doc), limits: service.limits() });
  });

  router.get('/:id', async (req, res) => {
    res.json({ interview: toPublic(await owned(req), service.limits()) });
  });

  router.post('/:id/end', async (req, res) => {
    const doc = await owned(req);
    if (doc.status === 'created') throw new HttpError(409, "This interview hasn't started yet.", { canRetry: false });
    if (doc.status === 'live') await service.endInterview(req.user.id, doc);
    res.json({ interview: toPublic(await owned(req), service.limits()) });
  });

  router.post('/:id/report', async (req, res) => {
    const doc = await owned(req);
    if (doc.status !== 'ended') throw new HttpError(409, "This interview isn't finished yet.", { canRetry: false });
    const claimed = await service.retryReport(req.user.id, doc._id);
    res.status(claimed ? 202 : 200).json({ interview: toPublic(claimed ?? doc, service.limits()) });
  });

  router.delete('/:id', async (req, res) => {
    const doc = await owned(req);
    await service.stop(doc._id);
    await repo.remove(req.user.id, doc._id);
    res.json({ ok: true });
  });

  return router;
}
