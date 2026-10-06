import { LIVE_RECONNECT_GRACE_MS } from '@waypoint/shared';
import { WebSocketServer } from 'ws';
import { COOKIE, readCookie } from '../auth/session.js';
import { getConfig } from '../config.js';
import { interviewerName } from './prompt.js';
import { generateReport, writeReport } from './report.js';
import { LiveSession } from './session.js';

const PATH = /^\/api\/live\/([A-Za-z0-9_-]{1,64})(?:\?.*)?$/;
const PING_EVERY_MS = 20_000;
const CONNECTS_PER_WINDOW = 40; // per user: far more than a real reconnecting browser needs
const CONNECT_WINDOW_MS = 10 * 60 * 1000;

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$/i;
const refused = new Set(); // origins already reported, so a retrying browser doesn't flood the log

/**
 * Browsers always send an Origin on WebSocket handshakes; only our own pages may open a live interview.
 * Own pages: the host the request was addressed to, APP_URL, and CORS_ORIGIN. While developing (not in production),
 * a page on any localhost port may also talk to an API on localhost: Vite moves to 5174, 5175… when 5173 is busy.
 */
export function originAllowed(req, config = getConfig()) {
  let origin;
  try {
    origin = new URL(req.headers.origin || '');
  } catch {
    return false;
  }
  if (origin.host === req.headers.host) return true;
  const allowed = [config.auth.appUrl, ...String(config.corsOrigin || '').split(',')].map((o) => o.trim()).filter(Boolean);
  if (allowed.some((o) => {
    try {
      return new URL(o).origin === origin.origin;
    } catch {
      return false;
    }
  })) return true;
  if (!config.production && LOOPBACK.test(origin.hostname)) {
    try {
      if (LOOPBACK.test(new URL(`http://${req.headers.host}`).hostname)) return true;
    } catch {
      /* an unusable Host header */
    }
  }
  if (refused.size < 50 && !refused.has(origin.origin)) { // bounded: anyone can send any Origin
    refused.add(origin.origin);
    console.warn(`[live] refused a WebSocket from ${origin.origin} (the API was addressed as ${req.headers.host}). Set APP_URL to the address you open the app at.`);
  }
  return false;
}

function refuse(socket, status, text) {
  if (socket.writable) socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

/**
 * Owns every running live interview of this server process, plus the rules around them: who may connect, what
 * happens when a browser disappears, and when the report is written.
 */
export function createLiveService({ repo, authRepo }) {
  const running = new Map(); // interview id → { session, userId }
  const graceTimers = new Map(); // interview id → timer for an interview whose browser vanished
  const connects = new Map(); // user id → recent connection times
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024, perMessageDeflate: false });

  const settings = () => {
    const { live } = getConfig();
    const targetSec = live.targetMinutes * 60;
    const maxSec = live.maxMinutes * 60;
    // One-second ticks in real life; proportionally faster only when tests configure interviews of a few seconds.
    return {
      voice: live.voice, targetSec, maxSec,
      tickMs: Math.max(50, Math.min(1000, Math.floor((targetSec * 1000) / 8))),
      cueTimeoutMs: Math.max(300, Math.min(12_000, Math.floor((targetSec * 1000) / 6))),
    };
  };
  /** What the browser needs to know about every interview: how long it runs and who the interviewer is. */
  const limits = () => {
    const { targetSec, maxSec, voice } = settings();
    return { targetSec, maxSec, interviewer: interviewerName(voice) };
  };

  // ───────────────────────── ending and reporting

  function startReport(userId, id) {
    generateReport(repo, userId, id).catch((err) => console.error('[live] report crashed:', err));
  }

  /** Retry a failed report. Resolves to the interview as claimed (now "generating"), or null if there was nothing to retry. */
  async function retryReport(userId, id) {
    const claimed = await repo.claimReport(userId, id);
    if (claimed) writeReport(repo, claimed).catch((err) => console.error('[live] report crashed:', err));
    return claimed;
  }

  async function endAndReport(userId, doc, reason) {
    const ended = await repo.end(doc._id, { reason, activeSeconds: doc.activeSeconds || 0 });
    if (ended) startReport(userId, doc._id);
    return ended;
  }

  /** A browser that left without ending the interview has a few minutes to come back; then the interview is over. */
  function armGrace(userId, id) {
    clearTimeout(graceTimers.get(id));
    const timer = setTimeout(async () => {
      graceTimers.delete(id);
      if (running.has(id)) return;
      try {
        const doc = await repo.get(userId, id);
        if (doc?.status === 'live') await endAndReport(userId, doc, 'disconnected');
      } catch (err) {
        console.error('[live] could not close an abandoned interview:', err.message);
      }
    }, LIVE_RECONNECT_GRACE_MS);
    timer.unref?.();
    graceTimers.set(id, timer);
  }

  /**
   * Bring a stored interview up to date before showing it: finish one whose browser vanished long ago (also covers
   * a server restart, which lost the timer above), and make sure an ended one has a report on the way.
   */
  async function reconcile(userId, doc) {
    if (!doc) return doc;
    if (doc.status === 'live' && !running.has(doc._id) && Date.now() - new Date(doc.lastSeenAt).getTime() > LIVE_RECONNECT_GRACE_MS) {
      await endAndReport(userId, doc, 'disconnected');
      return repo.get(userId, doc._id);
    }
    if (doc.status === 'ended') {
      if (doc.reportStatus === 'none') startReport(userId, doc._id);
      else if (doc.reportStatus === 'generating') return repo.releaseStaleReport(doc);
    }
    return doc;
  }

  // ───────────────────────── connections

  function rateOk(userId) {
    const now = Date.now();
    const recent = (connects.get(userId) || []).filter((t) => now - t < CONNECT_WINDOW_MS);
    recent.push(now);
    connects.set(userId, recent);
    return recent.length <= CONNECTS_PER_WINDOW;
  }

  async function run(ws, userId, interviewId) {
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    const say = (message) => ws.readyState === 1 && ws.send(JSON.stringify(message));
    const bail = (message, code = 1008) => {
      say(message);
      ws.close(code);
    };

    // Messages can arrive while the interview is being loaded; hold them until the session exists.
    let session = null;
    const early = [];
    ws.on('message', (data, isBinary) => {
      if (session) session.onClientMessage(data, isBinary);
      else if (early.length < 100) early.push([data, isBinary]); // only while the interview is being loaded
    });
    ws.on('error', () => {});

    if (running.size >= getConfig().live.maxSessions) {
      return bail({ type: 'error', message: 'The interview service is busy right now. Try again in a minute.', canRetry: true, fatal: true }, 1013);
    }

    let doc;
    try {
      doc = await repo.markLive(userId, interviewId);
    } catch (err) {
      console.error('[live] could not open interview:', err.message);
      return bail({ type: 'error', message: 'The database is temporarily unavailable. Try again in a moment.', canRetry: true, fatal: true }, 1011);
    }
    if (!doc) {
      const stored = await repo.get(userId, interviewId).catch(() => null);
      return bail(stored ? { type: 'ended', reason: stored.endReason } : { type: 'error', message: 'That interview no longer exists.', canRetry: false, fatal: true }, 1000);
    }
    // One live interview per user, one connection per interview: a newer connection replaces an older one.
    clearTimeout(graceTimers.get(interviewId));
    graceTimers.delete(interviewId);
    for (const [id, other] of [...running]) {
      if (other.userId !== userId) continue;
      running.delete(id);
      other.session.replace().catch(() => {});
    }

    session = new LiveSession({
      socket: ws,
      interview: doc,
      repo,
      settings: settings(),
      hooks: {
        onFinish: () => startReport(userId, interviewId),
        onClosed: () => {
          if (running.get(interviewId)?.session === session) running.delete(interviewId);
        },
      },
    });
    running.set(interviewId, { session, userId });

    ws.on('close', () => {
      const finished = session.finishing || session.closed;
      session.detach().then(() => {
        if (!finished && !running.has(interviewId)) armGrace(userId, interviewId);
      }).catch(() => {});
    });
    for (const [data, isBinary] of early) session.onClientMessage(data, isBinary);
    await session.start();
  }

  async function handleUpgrade(req, socket, head) {
    const match = PATH.exec(req.url || '');
    if (!match) return refuse(socket, 404, 'Not Found');
    if (!originAllowed(req)) return refuse(socket, 403, 'Forbidden');
    const token = readCookie(req, COOKIE);
    const found = token ? await authRepo.findSession(token) : null;
    if (!found) return refuse(socket, 401, 'Unauthorized');
    const userId = String(found.user._id);
    if (!rateOk(userId)) return refuse(socket, 429, 'Too Many Requests');
    const interviewId = match[1];
    wss.handleUpgrade(req, socket, head, (ws) => {
      run(ws, userId, interviewId).catch((err) => {
        console.error('[live] connection failed:', err);
        ws.terminate();
      });
    });
    return undefined;
  }

  const pinger = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) ws.terminate();
      else {
        ws.isAlive = false;
        ws.ping();
      }
    }
  }, PING_EVERY_MS);
  pinger.unref();

  return {
    limits,
    startReport,
    retryReport,
    reconcile,
    isRunning: (id) => running.has(id),
    /** End an interview the user asked to finish: through its live session if there is one, else directly. */
    async endInterview(userId, doc, reason = 'user') {
      const entry = running.get(doc._id);
      if (entry) await entry.session.end(reason);
      else await endAndReport(userId, doc, reason);
    },

    /** Disconnect a running interview (before it is deleted), keeping nothing running for it. */
    async stop(id) {
      const entry = running.get(id);
      if (entry) await entry.session.detach();
    },

    /** Answer WebSocket upgrades for `/api/live/:id` on this HTTP server. */
    attach(server) {
      server.on('upgrade', (req, socket, head) => {
        handleUpgrade(req, socket, head).catch((err) => {
          console.error('[live] upgrade failed:', err);
          refuse(socket, 500, 'Internal Server Error');
        });
      });
    },

    /** Shutting down: keep every transcript and let browsers know. Interviews stay resumable. */
    async closeAll() {
      clearInterval(pinger);
      for (const t of graceTimers.values()) clearTimeout(t);
      graceTimers.clear();
      await Promise.all(
        [...running.values()].map(async ({ session }) => {
          session.send({ type: 'error', message: 'The server is restarting. Reconnecting…', canRetry: true, fatal: false, code: 'restart' });
          await session.detach();
          try {
            session.socket.close(1001, 'server shutting down');
          } catch {
            /* already gone */
          }
        }),
      );
      running.clear();
    },
  };
}
