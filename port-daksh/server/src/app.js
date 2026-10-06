import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { createAuthRepo } from './auth/repo.js';
import { csrfGuard, requireAuth } from './auth/session.js';
import { getConfig } from './config.js';
import { HttpError } from './errors.js';
import { createInterviewRepo } from './live/repo.js';
import { createLiveService } from './live/service.js';
import { aiRoutes } from './routes/ai.js';
import { authRoutes } from './routes/auth.js';
import { interviewRoutes } from './routes/interviews.js';
import { resumeRoutes } from './routes/resume.js';
import { workspaceRoutes } from './routes/workspace.js';

// Fonts come from Google Fonts; everything else is our own origin. Inline styles are used throughout the UI.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

// A plain host[:port], as the Host header is when it is safe to repeat in a response header.
const SAFE_HOST = /^[A-Za-z0-9.-]+(:\d{1,5})?$|^\[[0-9a-fA-F:]+\](:\d{1,5})?$/;

/**
 * The live interview's voice channel is a WebSocket to this same host. `'self'` should cover it, but browsers
 * disagree about `ws:` under `'self'`, so name it explicitly.
 */
export function cspFor(req) {
  const host = req.headers.host;
  if (!host || !SAFE_HOST.test(host)) return CSP;
  const ws = req.secure ? `wss://${host}` : `ws://${host}`;
  return CSP.replace("connect-src 'self'", `connect-src 'self' ${ws}`);
}

function securityHeaders(withCsp) {
  return (req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      // Reset links carry a one-time token; never leak page URLs to other sites.
      'Referrer-Policy': 'no-referrer',
      // The live interview needs the microphone, and only from this app's own pages.
      'Permissions-Policy': 'camera=(), microphone=(self), geolocation=()',
      ...(withCsp ? { 'Content-Security-Policy': cspFor(req) } : null),
    });
    next();
  };
}

/** @param limits per-IP throttles for the auth endpoints; `{ disabled: true }` turns them off (tests). */
export async function createApp({ store, limits = {} }) {
  const config = getConfig();
  const repo = await createAuthRepo(store.db);
  const interviews = await createInterviewRepo(store.db);
  const live = createLiveService({ repo: interviews, authRepo: repo });
  const app = express();

  app.disable('x-powered-by');
  if (config.trustProxy) {
    const t = config.trustProxy;
    app.set('trust proxy', /^\d+$/.test(t) ? Number(t) : t === 'true' ? true : t);
  }

  const index = path.join(config.clientDist, 'index.html');
  const serveClient = fs.existsSync(index);
  app.use(securityHeaders(serveClient)); // the CSP is for the built app; the Vite dev server needs inline scripts
  if (config.corsOrigin) app.use(cors({ origin: config.corsOrigin.split(','), credentials: true }));
  app.use(express.json({ limit: '8mb' }));
  app.use('/api', csrfGuard);

  app.get('/api/health', (_req, res) => {
    const { ai } = getConfig();
    res.json({ ok: true, provider: 'gemini', model: ai.model, liveModel: getConfig().live.model, aiKeyConfigured: Boolean(ai.apiKey) });
  });

  app.use('/api/auth', authRoutes({ repo, store, limits }));

  // Everything below belongs to a logged-in user and only ever sees that user's workspace.
  const guard = requireAuth({ repo, store });
  // Model calls cost money: cap them per client.
  const aiLimiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { message: 'Too many AI requests. Wait a minute and retry.', canRetry: true } },
  });
  app.use('/api/workspace', guard, workspaceRoutes());
  app.use('/api/ai', guard, aiLimiter, aiRoutes());
  app.use('/api/resume', guard, resumeRoutes());
  app.use('/api/interviews', guard, interviewRoutes({ repo: interviews, service: live, limits }));
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found.')));

  // Production: serve the built React app and fall back to index.html for client-side routes.
  if (serveClient) {
    app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(index) : next()));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File is larger than 5 MB.' : 'The upload could not be processed.';
      return res.status(413).json({ error: { message: msg, canRetry: false } });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: { message: 'That request is too large.', canRetry: false } });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { message: 'Request body is not valid JSON.', canRetry: false } });
    }
    if (typeof err.name === 'string' && err.name.startsWith('Mongo')) {
      console.error('[server] database error:', err.message);
      return res.status(503).json({ error: { message: 'The database is temporarily unavailable. Try again in a moment.', canRetry: true } });
    }
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: { message: err.message, canRetry: err.canRetry, code: err.code, field: err.field } });
    }
    console.error('[server] unhandled error:', err);
    res.status(500).json({ error: { message: 'Something went wrong on the server.', canRetry: true } });
  });

  // The live interview's voice channel is a WebSocket on the same HTTP server: wire it up wherever this app listens.
  const listen = app.listen.bind(app);
  app.listen = (...args) => {
    const server = listen(...args);
    live.attach(server);
    return server;
  };
  /** Disconnect every live interview, keeping their transcripts (call before shutting the server down). */
  app.closeLive = () => live.closeAll();

  return app;
}
