import { ObjectId } from 'mongodb';
import { hashToken } from './tokens.js';

const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 15 * 60 * 1000;
const SESSION_TTL = { remember: 30 * 24 * 3600 * 1000, short: 24 * 3600 * 1000 };
const RESET_TTL_MS = 60 * 60 * 1000;

export class DuplicateEmailError extends Error {
  constructor() {
    super('An account with this email already exists.');
    this.name = 'DuplicateEmailError';
  }
}

/** What the API shows about a user — never the hash or security counters. */
export const publicUser = (u) => ({ id: String(u._id), name: u.name, email: u.email, createdAt: u.createdAt });

const toId = (id) => (id instanceof ObjectId ? id : new ObjectId(String(id)));

/**
 * Collections (all in the same database as the workspaces):
 *   users           { name, email (unique, lower-case), passwordHash, createdAt, updatedAt, lastLoginAt,
 *                     failedLogins, lockedUntil, passwordChangedAt, resetRequestedAt }
 *   sessions        { tokenHash (unique), userId, createdAt, lastUsedAt, expiresAt (TTL), remember }
 *   passwordResets  { tokenHash (unique), userId, createdAt, expiresAt (TTL) }
 * Tokens are stored only as SHA-256 hashes. Expired sessions and reset tokens are removed by MongoDB itself.
 */
export async function createAuthRepo(db) {
  const users = db.collection('users');
  const sessions = db.collection('sessions');
  const resets = db.collection('passwordResets');

  await Promise.all([
    users.createIndex({ email: 1 }, { unique: true, name: 'email_unique' }),
    sessions.createIndex({ tokenHash: 1 }, { unique: true, name: 'token_unique' }),
    sessions.createIndex({ userId: 1 }, { name: 'by_user' }),
    sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ttl' }),
    resets.createIndex({ tokenHash: 1 }, { unique: true, name: 'token_unique' }),
    resets.createIndex({ userId: 1 }, { name: 'by_user' }),
    resets.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ttl' }),
  ]);

  return {
    // ── users
    async createUser({ name, email, passwordHash }) {
      const now = new Date();
      const doc = { name, email, passwordHash, createdAt: now, updatedAt: now, lastLoginAt: null, failedLogins: 0, lockedUntil: null, passwordChangedAt: null, resetRequestedAt: null };
      try {
        const { insertedId } = await users.insertOne(doc);
        return { ...doc, _id: insertedId };
      } catch (err) {
        if (err?.code === 11000) throw new DuplicateEmailError();
        throw err;
      }
    },

    findUserByEmail: (email) => users.findOne({ email }),
    findUserById: (id) => users.findOne({ _id: toId(id) }),

    /** Count a failed password attempt; lock the account after too many in a row. */
    async recordFailedLogin(userId) {
      const user = await users.findOneAndUpdate({ _id: userId }, { $inc: { failedLogins: 1 } }, { returnDocument: 'after' });
      if (user && user.failedLogins >= MAX_FAILED_LOGINS) {
        await users.updateOne({ _id: userId }, { $set: { lockedUntil: new Date(Date.now() + LOCK_MS), failedLogins: 0 } });
      }
    },

    recordLogin: (userId) => users.updateOne({ _id: userId }, { $set: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } }),

    setPassword: (userId, passwordHash) =>
      users.updateOne({ _id: userId }, { $set: { passwordHash, passwordChangedAt: new Date(), updatedAt: new Date(), failedLogins: 0, lockedUntil: null } }),

    /** Atomically claim the right to send a reset email (at most one per minute per user). */
    async claimResetRequest(userId, minGapMs = 60_000) {
      const now = new Date();
      const claimed = await users.findOneAndUpdate(
        { _id: userId, $or: [{ resetRequestedAt: null }, { resetRequestedAt: { $lt: new Date(now - minGapMs) } }] },
        { $set: { resetRequestedAt: now } },
      );
      return Boolean(claimed);
    },

    // ── sessions
    async createSession(userId, token, { remember }) {
      const now = new Date();
      const ttl = remember ? SESSION_TTL.remember : SESSION_TTL.short;
      const session = { tokenHash: hashToken(token), userId, createdAt: now, lastUsedAt: now, expiresAt: new Date(+now + ttl), remember: Boolean(remember) };
      await sessions.insertOne(session);
      return session;
    },

    /** The live session for a cookie token (and its user), sliding the expiry forward when half spent. */
    async findSession(token) {
      const session = await sessions.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
      if (!session) return null;
      const user = await users.findOne({ _id: session.userId });
      if (!user) return null;
      const ttl = session.remember ? SESSION_TTL.remember : SESSION_TTL.short;
      if (session.expiresAt - Date.now() < ttl / 2) {
        await sessions.updateOne({ _id: session._id }, { $set: { expiresAt: new Date(Date.now() + ttl), lastUsedAt: new Date() } });
      }
      return { session, user };
    },

    deleteSession: (token) => sessions.deleteOne({ tokenHash: hashToken(token) }),
    deleteUserSessions: (userId) => sessions.deleteMany({ userId }),

    // ── password reset tokens
    /** Store a new reset token for the user; any earlier ones stop working. */
    async createReset(userId, token) {
      await resets.deleteMany({ userId });
      await resets.insertOne({ tokenHash: hashToken(token), userId, createdAt: new Date(), expiresAt: new Date(Date.now() + RESET_TTL_MS) });
    },

    /** Look at a reset token without using it up. */
    findReset: (token) => resets.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } }),

    /** Use a reset token up: succeeds exactly once. */
    consumeReset: (token) => resets.findOneAndDelete({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } }),

    deleteUserResets: (userId) => resets.deleteMany({ userId }),
  };
}

export const AUTH_LIMITS = { MAX_FAILED_LOGINS, LOCK_MS, RESET_TTL_MS, SESSION_TTL };
