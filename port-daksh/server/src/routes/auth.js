import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getConfig } from '../config.js';
import { HttpError } from '../errors.js';
import { hashPassword, passwordProblem, verifyPassword, dummyHash } from '../auth/passwords.js';
import { passwordChangedEmail, resetEmail, sendMail } from '../auth/mailer.js';
import { DuplicateEmailError, publicUser } from '../auth/repo.js';
import { clearSessionCookie, COOKIE, readCookie, setSessionCookie } from '../auth/session.js';
import { newToken } from '../auth/tokens.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const bad = (message, field, code) => new HttpError(400, message, { canRetry: false, field, code });

export function normalizeEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  if (!email) throw bad('Enter your email address.', 'email');
  if (email.length > 254 || !EMAIL.test(email)) throw bad('Enter a valid email address.', 'email');
  return email;
}

function normalizeName(value) {
  const name = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!name) throw bad('Enter your name.', 'name');
  if (name.length > 80) throw bad('Use 80 characters or fewer.', 'name');
  const hasControlChar = [...name].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127);
  if (hasControlChar || /[<>]/.test(name)) throw bad("Your name can't contain special characters.", 'name');
  return name;
}

const tooMany = { error: { message: 'Too many attempts. Please wait a few minutes and try again.', canRetry: true, code: 'rate_limited' } };

/** Per-IP throttles on top of the per-account lockout. `limits.disabled` is for tests. */
function limiter(limits, max, windowMs, extra = {}) {
  if (limits.disabled) return (_req, _res, next) => next();
  return rateLimit({ windowMs, limit: max, standardHeaders: 'draft-7', legacyHeaders: false, message: tooMany, ...extra });
}

/**
 *   POST /api/auth/signup            { name, email, password, remember? }
 *   POST /api/auth/login             { email, password, remember? }
 *   POST /api/auth/logout
 *   GET  /api/auth/me                → { user } (null when not logged in)
 *   POST /api/auth/forgot-password   { email }                 (always answers the same, whether or not the account exists)
 *   POST /api/auth/reset-password/check { token }              → { valid }
 *   POST /api/auth/reset-password    { token, password }
 */
export function authRoutes({ repo, store, limits = {} }) {
  const router = Router();

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store'); // credentials and tokens never belong in a cache
    next();
  });

  async function startSession(req, res, user, remember) {
    const token = newToken();
    await repo.createSession(user._id, token, { remember });
    setSessionCookie(req, res, token, { remember });
  }

  router.post('/signup', limiter(limits, 10, 3600_000), async (req, res) => {
    const name = normalizeName(req.body?.name);
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    const problem = passwordProblem(password, { email, name });
    if (problem) throw bad(problem, 'password', 'weak_password');

    let user;
    try {
      user = await repo.createUser({ name, email, passwordHash: await hashPassword(password) });
    } catch (err) {
      if (err instanceof DuplicateEmailError) {
        throw new HttpError(409, 'An account with this email already exists. Try logging in instead.', { canRetry: false, field: 'email', code: 'email_taken' });
      }
      throw err;
    }
    await store.forUser(user._id, { name }).ensure(); // the user's own, empty workspace
    await startSession(req, res, user, Boolean(req.body?.remember));
    res.status(201).json({ user: publicUser(user) });
  });

  router.post('/login', limiter(limits, 20, 15 * 60_000, { skipSuccessfulRequests: true }), async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password) throw bad('Enter your password.', 'password');

    const user = await repo.findUserByEmail(email);
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      throw new HttpError(429, 'Too many failed attempts. Please wait a few minutes and try again.', { canRetry: true, code: 'locked' });
    }
    // Always do the hashing work, even for unknown emails, so response time doesn't reveal who has an account.
    const ok = await verifyPassword(password.slice(0, 1024), user?.passwordHash ?? (await dummyHash()));
    if (!user || !ok) {
      if (user) await repo.recordFailedLogin(user._id);
      throw new HttpError(401, 'Incorrect email or password.', { canRetry: false, code: 'invalid_credentials' });
    }
    await repo.recordLogin(user._id);
    await startSession(req, res, user, Boolean(req.body?.remember));
    res.json({ user: publicUser(user) });
  });

  router.post('/logout', async (req, res) => {
    const token = readCookie(req, COOKIE);
    if (token) await repo.deleteSession(token);
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  // "Who am I?" Answers 200 either way ({ user: null } for visitors), so ordinary logged-out page views
  // don't produce errors in the browser console.
  router.get('/me', async (req, res) => {
    const token = readCookie(req, COOKIE);
    const found = token ? await repo.findSession(token) : null;
    res.json({ user: found ? publicUser(found.user) : null });
  });

  router.post('/forgot-password', limiter(limits, 5, 3600_000), async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const { auth } = getConfig();
    const user = await repo.findUserByEmail(email);
    let devLink;

    // The response is identical whether or not the account exists, so this can't be used to find out who has one.
    if (user && (await repo.claimResetRequest(user._id))) {
      const token = newToken();
      await repo.createReset(user._id, token);
      // The token travels in the URL fragment: it is never sent to a server, logged or put in a Referer header.
      const link = `${auth.appUrl}/reset-password#token=${token}`;
      if (auth.devResetLinks) devLink = link;
      sendMail({ to: user.email, ...resetEmail(link) }).catch((err) => console.error('[mail] could not send reset email:', err.message));
    }
    res.json({ ok: true, ...(devLink ? { devLink } : null) });
  });

  router.post('/reset-password/check', limiter(limits, 30, 3600_000), async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    res.json({ valid: token.length >= 20 && Boolean(await repo.findReset(token)) });
  });

  router.post('/reset-password', limiter(limits, 10, 3600_000), async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    const invalid = new HttpError(400, 'This reset link is invalid or has expired. Request a new one.', { canRetry: false, code: 'invalid_token' });
    const reset = token.length >= 20 ? await repo.findReset(token) : null;
    if (!reset) throw invalid;
    const user = await repo.findUserById(reset.userId);
    if (!user) throw invalid;

    const problem = passwordProblem(req.body?.password, { email: user.email, name: user.name });
    if (problem) throw bad(problem, 'password', 'weak_password'); // token is kept, so they can try again

    if (!(await repo.consumeReset(token))) throw invalid; // someone else used it a moment ago
    await repo.setPassword(user._id, await hashPassword(req.body.password));
    await repo.deleteUserSessions(user._id); // sign out everywhere, including whoever knew the old password
    await repo.deleteUserResets(user._id);
    sendMail({ to: user.email, ...passwordChangedEmail() }).catch((err) => console.error('[mail] could not send notice:', err.message));
    res.json({ ok: true });
  });

  return router;
}
