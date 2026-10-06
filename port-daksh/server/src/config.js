import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
export const DEFAULT_DB = 'waypoint_ai';

/**
 * Read an environment variable ignoring case, so `GEMINI_API_KEY` and `gemini_api_key` both work
 * (Windows is case-insensitive already; Linux and macOS are not). Blank values count as unset.
 */
export function readEnv(name, env = process.env) {
  const key = Object.hasOwn(env, name) ? name : Object.keys(env).find((k) => k.toLowerCase() === name.toLowerCase());
  const value = key === undefined ? undefined : String(env[key]).trim();
  return value || undefined;
}

// Values people leave in .env from the template, e.g. "your_api_key_here".
const PLACEHOLDER_KEY = /^(your[_ -]?(gemini[_ -]?)?(api[_ -]?)?key(?:[_ -]?here)?|changeme|<.*>)$/i;

/** The Gemini API key, or undefined if it is missing or still the template placeholder. */
export function getApiKey(env = process.env) {
  const key = readEnv('GEMINI_API_KEY', env);
  return key && !PLACEHOLDER_KEY.test(key) ? key : undefined;
}

/** The MongoDB connection string, or undefined if missing or still the template (`<user>:<password>`). */
export function getMongoUri(env = process.env) {
  const uri = readEnv('MONGODB_URI', env);
  return uri && /^mongodb(\+srv)?:\/\//i.test(uri) && !/[<>]/.test(uri) ? uri : undefined;
}

/** "cluster.example.mongodb.net" — safe to log (never includes the credentials). */
export function mongoHost(uri) {
  try {
    return new URL(uri).host;
  } catch {
    return 'unknown host';
  }
}

const truthy = (v) => /^(1|true|yes|on)$/i.test(v || '');

/** SMTP settings for sending email, or undefined when email isn't configured. */
export function getSmtp(env = process.env) {
  const host = readEnv('SMTP_HOST', env);
  if (!host) return undefined;
  const port = Number(readEnv('SMTP_PORT', env)) || 587;
  const user = readEnv('SMTP_USER', env);
  return {
    host,
    port,
    secure: readEnv('SMTP_SECURE', env) ? truthy(readEnv('SMTP_SECURE', env)) : port === 465,
    auth: user ? { user, pass: readEnv('SMTP_PASS', env) || '' } : undefined,
    from: readEnv('MAIL_FROM', env) || user || 'Waypoint <no-reply@localhost>',
  };
}

/** Read lazily so tests (and `--env-file`) can change the environment before first use. */
export function getConfig() {
  const env = process.env;
  return {
    port: Number(env.PORT) || 4000,
    // By default only this machine can reach the API. Set HOST=0.0.0.0 to expose it (and put HTTPS in front).
    host: env.HOST || '127.0.0.1',
    clientDist: path.resolve(here, '..', '..', 'client', 'dist'),
    corsOrigin: env.CORS_ORIGIN || '',
    production: env.NODE_ENV === 'production',
    // Behind a reverse proxy set TRUST_PROXY (e.g. 1) so client IPs (rate limits) and HTTPS (cookies) are right.
    trustProxy: readEnv('TRUST_PROXY', env),
    auth: {
      // Where users open the app; reset-password links point here. In dev that is the Vite server.
      appUrl: (readEnv('APP_URL', env) || 'http://localhost:5173').replace(/\/+$/, ''),
      cookieSecure: readEnv('COOKIE_SECURE', env) ? truthy(readEnv('COOKIE_SECURE', env)) : /^https:/i.test(readEnv('APP_URL', env) || ''),
      // Local-development convenience ONLY: return the reset link in the API response instead of emailing it.
      devResetLinks: truthy(readEnv('AUTH_DEV_RESET_LINKS', env)) && env.NODE_ENV !== 'production',
      smtp: getSmtp(env),
    },
    mongo: {
      uri: getMongoUri(env),
      dbName: readEnv('MONGODB_DB', env) || DEFAULT_DB,
    },
    ai: {
      apiKey: getApiKey(env),
      model: readEnv('GEMINI_MODEL', env) || DEFAULT_MODEL,
      timeoutMs: Number(readEnv('GEMINI_TIMEOUT_MS', env)) || 120_000,
    },
  };
}
