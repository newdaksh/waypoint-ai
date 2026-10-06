import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

// scrypt (memory-hard, built into Node: no native dependency). Parameters are stored with each hash,
// so they can be raised later without invalidating existing passwords.
const PARAMS = { N: 2 ** 15, r: 8, p: 1 };
const KEY_LENGTH = 64;
const MAX_MEMORY = 128 * 1024 * 1024;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128; // bounds the work an attacker can force per request

const derive = (password, salt, { N, r, p }) =>
  scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH, { N, r, p, maxmem: MAX_MEMORY });

/** → "scrypt$N$r$p$salt$hash" (all base64 where binary). */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), key.toString('base64')].join('$');
}

/** Constant-time check of a password against a stored hash. Never throws on malformed hashes. */
export async function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, salt, hash] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const expected = Buffer.from(hash, 'base64');
    const actual = await derive(password, Buffer.from(salt, 'base64'), { N: Number(N), r: Number(r), p: Number(p) });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

// A real hash to compare against when the account doesn't exist, so "no such user" costs the same time
// as "wrong password" and timing can't reveal which emails are registered.
let dummy;
export const dummyHash = () => (dummy ??= hashPassword(randomBytes(12).toString('hex')));

const COMMON = new Set(
  `password password1 password12 password123 passw0rd p@ssw0rd p@ssword 12345678 123456789 1234567890 11111111 00000000 12341234
   qwertyui qwerty123 qwertyuiop 1q2w3e4r 1q2w3e4r5t zaq12wsx abc12345 abcd1234 iloveyou iloveyou1 welcome1 welcome123 admin123
   administrator letmein123 monkey123 dragon123 football1 baseball1 superman1 master123 sunshine1 princess1 trustno1 changeme
   changeme123 whatever1 starwars1 passwort1 contrasena resume123 waypoint waypoint1 waypoint123 career123 jobsearch1`
    .split(/\s+/)
    .filter(Boolean),
);

/**
 * Password rules (length, not a well-known password, not derived from the account). Returns a
 * user-facing message, or null when the password is acceptable. Deliberately no "must contain a
 * symbol" rules: length and unpredictability matter more.
 */
export function passwordProblem(password, { email = '', name = '' } = {}) {
  if (typeof password !== 'string') return 'Enter a password.';
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return 'That password is too common. Choose something harder to guess.';
  if (/^(.)\1+$/.test(password)) return 'Avoid repeating a single character.';
  const local = email.split('@')[0].toLowerCase();
  if (email && (lower === email.toLowerCase() || (local.length >= 4 && lower === local))) return "Your password can't be your email address.";
  const first = name.trim().split(/\s+/)[0]?.toLowerCase();
  if (first && first.length >= 4 && lower === first) return "Your password can't be your name.";
  return null;
}
