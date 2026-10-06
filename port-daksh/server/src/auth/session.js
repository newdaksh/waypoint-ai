import { getConfig } from '../config.js';
import { HttpError } from '../errors.js';
import { publicUser } from './repo.js';

export const COOKIE = 'wp_session';
const REMEMBER_MS = 30 * 24 * 3600 * 1000;

/** Read one cookie from the request (no dependency needed for a single value). */
export function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

const cookieOptions = (req) => ({
  httpOnly: true, // not readable by page scripts, so an XSS bug can't steal the session
  sameSite: 'lax', // not sent on cross-site POSTs (CSRF); still sent on normal link navigation
  secure: getConfig().auth.cookieSecure || req.secure,
  path: '/',
});

/** Set the session cookie. Without "remember me" it is a browser-session cookie (gone when the browser closes). */
export function setSessionCookie(req, res, token, { remember }) {
  res.cookie(COOKIE, token, { ...cookieOptions(req), ...(remember ? { maxAge: REMEMBER_MS } : null) });
}

export function clearSessionCookie(req, res) {
  res.clearCookie(COOKIE, cookieOptions(req));
}

/** Guard for routes that need a logged-in user. Sets req.user and req.workspace (that user's data). */
export function requireAuth({ repo, store }) {
  return async (req, _res, next) => {
    const token = readCookie(req, COOKIE);
    const found = token ? await repo.findSession(token) : null;
    if (!found) throw new HttpError(401, 'Please log in to continue.', { code: 'unauthenticated', canRetry: false });
    req.user = publicUser(found.user);
    req.sessionToken = token;
    req.workspace = store.forUser(found.user._id, { name: found.user.name });
    next();
  };
}

/**
 * Cross-site request forgery guard: every state-changing API call must carry a custom header. Browsers
 * only let same-origin scripts add one (cross-origin needs a CORS preflight we never approve), so a
 * hostile page can't forge requests — independent of the SameSite cookie setting above.
 */
export function csrfGuard(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-requested-with') !== 'waypoint') {
    return next(new HttpError(403, 'This request was blocked for your security. Reload the page and try again.', { code: 'csrf', canRetry: false }));
  }
  next();
}
