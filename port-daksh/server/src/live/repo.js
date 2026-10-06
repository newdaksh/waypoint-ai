import { randomBytes } from 'node:crypto';

export const MAX_TURNS = 800; // transcript entries kept per interview (a 30-minute interview is a few hundred)
const MAX_QUESTIONS = 120;
const REPORT_STALE_MS = 4 * 60 * 1000; // a report "generating" for longer than this was lost (server restarted)

export const newInterviewId = () => `iv_${randomBytes(9).toString('base64url')}`;

const iso = (d) => (d instanceof Date ? d.toISOString() : d ?? null);

/** What lists show: no transcript, no resume text. */
export function toSummary(doc) {
  return {
    id: doc._id,
    status: doc.status,
    endReason: doc.endReason ?? null,
    resume: doc.resume,
    job: doc.job,
    createdAt: iso(doc.createdAt),
    startedAt: iso(doc.startedAt),
    endedAt: iso(doc.endedAt),
    activeSeconds: doc.activeSeconds || 0,
    turns: doc.turns ?? doc.transcript?.length ?? 0,
    reportStatus: doc.reportStatus,
    overall: doc.report?.overall ?? null,
    verdict: doc.report?.verdict ?? null,
  };
}

/** The whole interview as its owner sees it. The resume / job text snapshot stays on the server. */
export function toPublic(doc, limits) {
  return {
    ...toSummary(doc),
    transcript: doc.transcript || [],
    questions: doc.questions || [],
    report: doc.report ?? null,
    reportError: doc.reportError ?? null,
    limits: limits ?? null,
  };
}

/**
 * Collection `interviews` (same database as the workspaces):
 *   { _id, userId, status: 'created'|'live'|'ended', endReason, resume:{id,name}, job:{id,title,company},
 *     snapshot:{ resumeText, jobText, candidate:{name,role,level,years}, tone },   ← what the interview was run on
 *     createdAt, startedAt, endedAt, lastSeenAt, activeSeconds,
 *     transcript:[{ id, role:'interviewer'|'candidate', text, at, t, interrupted? }],
 *     questions:[{ id, question, round, difficulty, followUp, at, t }],
 *     reportStatus:'none'|'generating'|'ready'|'failed'|'insufficient', reportStartedAt, reportError, report }
 * One document per interview; every write targets exactly the fields it changes, so a late transcript write can
 * never overwrite a report and several server processes can share the collection.
 */
export async function createInterviewRepo(db) {
  const col = db.collection('interviews');
  await col.createIndex({ userId: 1, createdAt: -1 }, { name: 'by_user' });

  const mine = (userId, id) => ({ _id: String(id), userId: String(userId) });

  return {
    async create({ userId, resume, job, snapshot }) {
      const now = new Date();
      const doc = {
        _id: newInterviewId(), userId: String(userId), status: 'created', endReason: null,
        resume, job, snapshot, createdAt: now, startedAt: null, endedAt: null, lastSeenAt: now, activeSeconds: 0,
        transcript: [], questions: [], reportStatus: 'none', reportStartedAt: null, reportError: null, report: null,
      };
      await col.insertOne(doc);
      return doc;
    },

    get: (userId, id) => col.findOne(mine(userId, id)),

    /** Newest first, without the heavy fields. */
    list: (userId, limit = 50) =>
      col
        .find(
          { userId: String(userId) },
          {
            projection: {
              userId: 1, status: 1, endReason: 1, resume: 1, job: 1, createdAt: 1, startedAt: 1, endedAt: 1, lastSeenAt: 1,
              activeSeconds: 1, reportStatus: 1, reportStartedAt: 1, 'report.overall': 1, 'report.verdict': 1,
              turns: { $size: { $ifNull: ['$transcript', []] } },
            },
          },
        )
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray(),

    remove: (userId, id) => col.deleteOne(mine(userId, id)),

    /** Interviews that were prepared but never joined only clutter the history. */
    removeUnstarted: (userId) => col.deleteMany({ userId: String(userId), status: 'created', startedAt: null }),

    /** First connection starts the clock; later ones (reconnects) only refresh the heartbeat. */
    markLive(userId, id) {
      const now = new Date();
      return col.findOneAndUpdate(
        { ...mine(userId, id), status: { $in: ['created', 'live'] } },
        [{ $set: { status: 'live', lastSeenAt: now, startedAt: { $ifNull: ['$startedAt', now] } } }], // one atomic step
        { returnDocument: 'after' },
      );
    },

    heartbeat: (id, activeSeconds) =>
      col.updateOne({ _id: id, status: 'live' }, { $set: { lastSeenAt: new Date(), activeSeconds: Math.round(activeSeconds) } }),

    appendTurn: (id, turn) => col.updateOne({ _id: id, status: { $ne: 'ended' } }, { $push: { transcript: { $each: [turn], $slice: MAX_TURNS } } }),

    addQuestion: (id, question) => col.updateOne({ _id: id, status: { $ne: 'ended' } }, { $push: { questions: { $each: [question], $slice: MAX_QUESTIONS } } }),

    /**
     * Mark the interview finished. Atomic and idempotent: only the first caller gets the document back, so the
     * report is started exactly once however the interview ended (button, AI, time limit, lost connection).
     */
    end: (id, { reason, activeSeconds }) =>
      col.findOneAndUpdate(
        { _id: id, status: { $in: ['created', 'live'] } },
        { $set: { status: 'ended', endReason: reason, endedAt: new Date(), activeSeconds: Math.round(activeSeconds), lastSeenAt: new Date() } },
        { returnDocument: 'after' },
      ),

    /** Take the right to write the report: only an ended interview without a finished or running report. */
    claimReport: (userId, id) =>
      col.findOneAndUpdate(
        {
          ...mine(userId, id),
          status: 'ended',
          $or: [
            { reportStatus: { $in: ['none', 'failed'] } },
            { reportStatus: 'generating', reportStartedAt: { $lt: new Date(Date.now() - REPORT_STALE_MS) } },
          ],
        },
        { $set: { reportStatus: 'generating', reportStartedAt: new Date(), reportError: null } },
        { returnDocument: 'after' },
      ),

    setReport: (id, report) => col.updateOne({ _id: id }, { $set: { reportStatus: 'ready', report, reportError: null } }),

    /** `status` is 'failed' (retry may help) or 'insufficient' (the interview was too short to assess). */
    failReport: (id, status, message) => col.updateOne({ _id: id }, { $set: { reportStatus: status, reportError: message } }),

    /** A report left "generating" by a process that died is retryable again. */
    async releaseStaleReport(doc) {
      if (doc.reportStatus !== 'generating' || Date.now() - new Date(doc.reportStartedAt).getTime() < REPORT_STALE_MS) return doc;
      await col.updateOne({ _id: doc._id, reportStatus: 'generating' }, { $set: { reportStatus: 'failed', reportError: 'The report was interrupted. Retry to generate it again.' } });
      return { ...doc, reportStatus: 'failed', reportError: 'The report was interrupted. Retry to generate it again.' };
    },
  };
}
