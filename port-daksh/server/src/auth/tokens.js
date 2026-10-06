import { createHash, randomBytes } from 'node:crypto';

/** A new unguessable token (256 bits), URL- and cookie-safe. */
export const newToken = () => randomBytes(32).toString('base64url');

/**
 * Only the SHA-256 of a token is ever stored. Tokens are high-entropy random values, so a fast hash is
 * appropriate (unlike passwords) — and a database leak does not reveal usable session or reset tokens.
 */
export const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex');
