import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';
import { hashPassword, passwordProblem, verifyPassword } from '../src/auth/passwords.js';
import { hashToken } from '../src/auth/tokens.js';
import { startServer } from './helpers.js';

const until = async (check, ms = 2000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return true;
    await new Promise((r) => setTimeout(r, 10));
  }
  return false;
};
const tokenFrom = (mail) => mail.link.split('#token=')[1];

describe('passwords', () => {
  it('hashes with a random salt and verifies in constant-time form', async () => {
    const a = await hashPassword('correct horse battery');
    const b = await hashPassword('correct horse battery');
    assert.match(a, /^scrypt\$32768\$8\$1\$/);
    assert.notEqual(a, b, 'salted: same password, different hashes');
    assert.equal(await verifyPassword('correct horse battery', a), true);
    assert.equal(await verifyPassword('correct horse batterz', a), false);
    assert.equal(a.includes('correct horse'), false);
  });

  it('never throws on malformed or foreign hashes', async () => {
    for (const bad of ['', 'plaintext', 'bcrypt$x$y', 'scrypt$1$2$3$4$5', null, undefined, 'scrypt$32768$8$1$AAAA']) {
      assert.equal(await verifyPassword('x', bad), false, String(bad));
    }
  });

  it('applies the password rules', () => {
    const ctx = { email: 'priya.nair@example.com', name: 'Priya Nair' };
    assert.equal(passwordProblem('correct horse battery', ctx), null);
    assert.equal(passwordProblem('Tr0ub4dor&3', ctx), null);
    assert.match(passwordProblem('short', ctx), /at least 8/);
    assert.match(passwordProblem('x'.repeat(129), ctx), /at most 128/);
    assert.match(passwordProblem('password123', ctx), /too common/);
    assert.match(passwordProblem('PASSWORD123', ctx), /too common/);
    assert.match(passwordProblem('aaaaaaaaaa', ctx), /repeating/);
    assert.match(passwordProblem('priya.nair@example.com', ctx), /email/);
    assert.match(passwordProblem('alexander', { email: 'a@example.com', name: 'Alexander Hamilton' }), /name/);
    assert.equal(passwordProblem('alexander-hamilton-1755', { email: 'a@example.com', name: 'Alexander Hamilton' }), null, 'containing the name is fine; equalling it is not');
    assert.equal(passwordProblem(undefined, ctx), 'Enter a password.');
  });
});

describe('auth API', () => {
  let s;
  before(async () => { s = await startServer(); });
  after(() => s.close());
  afterEach(() => { s.mails.length = 0; });

  describe('signup', () => {
    it('creates the account, starts a session, and gives the user an empty workspace', async () => {
      const res = await s.send('POST', '/api/auth/signup', { name: '  Priya   Nair ', email: '  Priya@Example.COM ', password: 'correct horse battery' });
      assert.equal(res.status, 201);
      assert.deepEqual(Object.keys(res.body.user).sort(), ['createdAt', 'email', 'id', 'name']);
      assert.equal(res.body.user.name, 'Priya Nair', 'whitespace collapsed');
      assert.equal(res.body.user.email, 'priya@example.com', 'email normalised');
      assert.equal(JSON.stringify(res.body).includes('passwordHash'), false);

      const me = await s.send('GET', '/api/auth/me', undefined, { cookie: res.cookie.split(';')[0] });
      assert.equal(me.status, 200);
      assert.equal(me.body.user.email, 'priya@example.com');

      const ws = (await s.send('GET', '/api/workspace', undefined, { cookie: res.cookie.split(';')[0] })).body;
      assert.equal(ws.profile.name, 'Priya Nair', 'profile starts with the account name');
      assert.deepEqual([ws.jobs, ws.apps, ws.chat, ws.questions], [[], [], [], []]);
      assert.deepEqual([ws.roadmap, ws.safety, ws.bullets], [null, null, null]);
      assert.deepEqual(ws.analysisBy, {});
      assert.deepEqual(ws.resumes.map((r) => r.text), ['']);
      assert.equal(ws.activeJobId, null);
      assert.equal('_id' in ws, false);
    });

    it('sets a hardened session cookie (HttpOnly, SameSite=Lax, session-only unless "remember me")', async () => {
      const plain = await s.send('POST', '/api/auth/signup', { name: 'A One', email: 'a1@example.com', password: 'correct horse battery' });
      assert.match(plain.cookie, /^wp_session=[\w-]{40,}/);
      assert.match(plain.cookie, /HttpOnly/i);
      assert.match(plain.cookie, /SameSite=Lax/i);
      assert.match(plain.cookie, /Path=\//);
      assert.doesNotMatch(plain.cookie, /Max-Age|Expires/i, 'a browser-session cookie');

      const remembered = await s.send('POST', '/api/auth/signup', { name: 'A Two', email: 'a2@example.com', password: 'correct horse battery', remember: true });
      assert.match(remembered.cookie, /Max-Age=2592000/);
    });

    it('stores only a password hash, and only a hash of the session token', async () => {
      const u = await s.signup({ email: 'secrets@example.com', password: 'a very private passphrase' });
      const doc = await s.db.raw((d) => d.collection('users').findOne({ email: 'secrets@example.com' }));
      assert.match(doc.passwordHash, /^scrypt\$/);
      assert.equal(JSON.stringify(doc).includes('a very private passphrase'), false);
      const token = u.cookie.split('=')[1];
      const sessions = await s.db.raw((d) => d.collection('sessions').find({ userId: doc._id }).toArray());
      assert.equal(sessions.length, 1);
      assert.equal(sessions[0].tokenHash, hashToken(token));
      assert.equal(JSON.stringify(sessions).includes(token), false, 'the raw session token is never stored');
    });

    it('validates every field and says which one is wrong', async () => {
      const cases = [
        [{ name: '', email: 'x@example.com', password: 'correct horse battery' }, 'name'],
        [{ name: 'x'.repeat(81), email: 'x@example.com', password: 'correct horse battery' }, 'name'],
        [{ name: '<b>Hi</b>', email: 'x@example.com', password: 'correct horse battery' }, 'name'],
        [{ name: 'X', email: '', password: 'correct horse battery' }, 'email'],
        [{ name: 'X', email: 'not-an-email', password: 'correct horse battery' }, 'email'],
        [{ name: 'X', email: 'a@b', password: 'correct horse battery' }, 'email'],
        [{ name: 'X', email: 'x@example.com', password: 'short' }, 'password'],
        [{ name: 'X', email: 'x@example.com', password: 'password123' }, 'password'],
        [{ name: 'X', email: 'x@example.com', password: 'x'.repeat(200) }, 'password'],
        [{ name: 'X', email: 'x@example.com' }, 'password'],
      ];
      for (const [body, field] of cases) {
        const r = await s.send('POST', '/api/auth/signup', body);
        assert.equal(r.status, 400, JSON.stringify(body));
        assert.equal(r.body.error.field, field, JSON.stringify(body));
        assert.equal(r.cookie, undefined, 'no session on failure');
      }
    });

    it('rejects a duplicate email regardless of case, without creating a second account', async () => {
      await s.signup({ email: 'dup@example.com' });
      const r = await s.send('POST', '/api/auth/signup', { name: 'Other', email: 'DUP@example.com', password: 'another long passphrase' });
      assert.equal(r.status, 409);
      assert.equal(r.body.error.code, 'email_taken');
      assert.equal(r.body.error.field, 'email');
      assert.equal(await s.db.raw((d) => d.collection('users').countDocuments({ email: 'dup@example.com' })), 1);
    });

    it('survives many simultaneous signups for one email (unique index): exactly one wins', async () => {
      const results = await Promise.all(Array.from({ length: 6 }, () => s.send('POST', '/api/auth/signup', { name: 'Racer', email: 'race@example.com', password: 'correct horse battery' })));
      assert.equal(results.filter((r) => r.status === 201).length, 1);
      assert.equal(results.filter((r) => r.status === 409).length, 5);
    });
  });

  describe('login / logout / session', () => {
    it('logs in with any capitalisation of the email', async () => {
      await s.signup({ email: 'case@example.com', password: 'correct horse battery' });
      const r = await s.send('POST', '/api/auth/login', { email: 'CASE@Example.com', password: 'correct horse battery' });
      assert.equal(r.status, 200);
      assert.equal(r.body.user.email, 'case@example.com');
      assert.ok(r.cookie);
    });

    it('gives the same generic answer for a wrong password and an unknown account', async () => {
      await s.signup({ email: 'real@example.com', password: 'correct horse battery' });
      const wrong = await s.send('POST', '/api/auth/login', { email: 'real@example.com', password: 'wrong password!' });
      const unknown = await s.send('POST', '/api/auth/login', { email: 'nobody@example.com', password: 'wrong password!' });
      assert.equal(wrong.status, 401);
      assert.equal(unknown.status, 401);
      assert.deepEqual(wrong.body, unknown.body, 'identical bodies: no way to tell which emails exist');
      assert.equal(wrong.cookie, undefined);
    });

    it('requires an email and a password', async () => {
      assert.equal((await s.send('POST', '/api/auth/login', { email: '', password: 'x' })).body.error.field, 'email');
      assert.equal((await s.send('POST', '/api/auth/login', { email: 'a@example.com', password: '' })).body.error.field, 'password');
    });

    it('locks the account after 5 wrong passwords, even for the right one, until the lock expires', async () => {
      const u = await s.signup({ email: 'lock@example.com', password: 'correct horse battery' });
      for (let i = 0; i < 5; i++) {
        assert.equal((await s.send('POST', '/api/auth/login', { email: u.email, password: `wrong ${i}` })).status, 401);
      }
      const locked = await s.send('POST', '/api/auth/login', { email: u.email, password: 'correct horse battery' });
      assert.equal(locked.status, 429);
      assert.equal(locked.body.error.code, 'locked');

      await s.db.raw((d) => d.collection('users').updateOne({ email: u.email }, { $set: { lockedUntil: new Date(Date.now() - 1000) } }));
      assert.equal((await s.send('POST', '/api/auth/login', { email: u.email, password: 'correct horse battery' })).status, 200);
    });

    it('a successful login resets the failure counter', async () => {
      const u = await s.signup({ email: 'reset-count@example.com', password: 'correct horse battery' });
      for (let i = 0; i < 4; i++) await s.send('POST', '/api/auth/login', { email: u.email, password: 'nope nope nope' });
      assert.equal((await s.send('POST', '/api/auth/login', { email: u.email, password: u.password })).status, 200);
      for (let i = 0; i < 4; i++) await s.send('POST', '/api/auth/login', { email: u.email, password: 'nope nope nope' });
      assert.equal((await s.send('POST', '/api/auth/login', { email: u.email, password: u.password })).status, 200, '4 + 4 failures with a success between never lock');
    });

    it('logout ends the session on the server and clears the cookie', async () => {
      const u = await s.signup();
      assert.equal((await u.get('/api/auth/me')).status, 200);
      const out = await u.post('/api/auth/logout');
      assert.equal(out.status, 200);
      assert.match(out.headers.getSetCookie().join(';'), /wp_session=;/);
      assert.equal((await u.get('/api/auth/me')).body.user, null, 'the old cookie is dead even if someone kept it');
      assert.equal((await u.get('/api/workspace')).status, 401);
    });

    it('rejects expired sessions and garbage cookies', async () => {
      const u = await s.signup();
      await s.db.raw((d) => d.collection('sessions').updateMany({ userId: { $exists: true } }, { $set: { expiresAt: new Date(Date.now() - 1000) } }));
      const r = await u.get('/api/auth/me');
      assert.deepEqual([r.status, r.body.user], [200, null], 'an expired session counts as logged out');
      const blocked = await u.get('/api/workspace');
      assert.equal(blocked.status, 401);
      assert.equal(blocked.body.error.code, 'unauthenticated');
      for (const cookie of ['wp_session=garbage', 'wp_session=', 'wp_session=%E0%A4%A', 'other=1']) {
        const me = await s.send('GET', '/api/auth/me', undefined, { cookie });
        assert.deepEqual([me.status, me.body.user], [200, null], cookie);
        assert.equal((await s.send('GET', '/api/workspace', undefined, { cookie })).status, 401, cookie);
      }
    });

    it('slides a long session forward once half of it is used up', async () => {
      const u = await s.signup({ remember: true });
      const hash = hashToken(u.cookie.split('=')[1]);
      const soon = new Date(Date.now() + 5 * 24 * 3600 * 1000);
      await s.db.raw((d) => d.collection('sessions').updateOne({ tokenHash: hash }, { $set: { expiresAt: soon } }));
      assert.equal((await u.get('/api/auth/me')).status, 200);
      const after = await s.db.raw((d) => d.collection('sessions').findOne({ tokenHash: hash }));
      assert.ok(after.expiresAt - Date.now() > 29 * 24 * 3600 * 1000, 'extended to a fresh 30 days');
    });
  });

  describe('protection', () => {
    it('keeps every data route behind login (but not the health check)', async () => {
      for (const [method, url] of [['GET', '/api/workspace'], ['PATCH', '/api/workspace'], ['POST', '/api/ai/ats'], ['POST', '/api/ai/chat'], ['POST', '/api/resume/extract']]) {
        const r = await s.send(method, url, method === 'GET' ? undefined : {});
        assert.equal(r.status, 401, `${method} ${url}`);
      }
      assert.equal((await s.get('/api/health')).status, 200);
      const me = await s.get('/api/auth/me');
      assert.deepEqual([me.status, me.body], [200, { user: null }], 'visitors get a plain "nobody" answer, not an error');
    });

    it('blocks state-changing requests that lack the anti-CSRF header', async () => {
      const u = await s.signup();
      const forged = await fetch(`${s.base}/api/workspace`, { method: 'PATCH', headers: { cookie: u.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ set: { bulletInput: 'forged' } }) });
      assert.equal(forged.status, 403);
      assert.equal((await forged.json()).error.code, 'csrf');
      assert.notEqual((await u.ws()).bulletInput, 'forged');
      const noHeaderLogin = await fetch(`${s.base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      assert.equal(noHeaderLogin.status, 403);
    });

    it('sets security headers and never caches auth responses', async () => {
      const r = await s.send('POST', '/api/auth/login', { email: 'a@example.com', password: 'x' });
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(r.headers.get('x-frame-options'), 'DENY');
      assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
      assert.equal(r.headers.get('cache-control'), 'no-store');
      assert.equal(r.headers.get('x-powered-by'), null);
    });

    it("isolates users: each only ever sees and changes their own workspace", async () => {
      const a = await s.signup({ name: 'User A' });
      const b = await s.signup({ name: 'User B' });
      await a.patch('/api/workspace', { set: { resumes: [{ id: 'master', name: 'Master resume', text: 'A private resume '.repeat(10) }], bulletInput: 'only A' } });
      await b.patch('/api/workspace', { set: { bulletInput: 'only B' } });

      const wa = (await a.get('/api/workspace')).body;
      const wb = (await b.get('/api/workspace')).body;
      assert.equal(wa.bulletInput, 'only A');
      assert.equal(wb.bulletInput, 'only B');
      assert.match(wa.resumes[0].text, /^A private resume/);
      assert.deepEqual(wb.resumes.map((r) => r.text), [''], "B can't see A's resume");
      assert.equal(wa.profile.name, 'User A');
      assert.equal(wb.profile.name, 'User B');
      assert.equal(await s.db.raw((d) => d.collection('workspaces').countDocuments({ _id: { $in: [a.user.id, b.user.id] } })), 2);
    });
  });

  describe('forgot / reset password', () => {
    it('answers identically whether or not the account exists, and emails only real accounts', async () => {
      const u = await s.signup({ email: 'forgetful@example.com' });
      const real = await s.send('POST', '/api/auth/forgot-password', { email: u.email });
      const fake = await s.send('POST', '/api/auth/forgot-password', { email: 'ghost@example.com' });
      assert.equal(real.status, 200);
      assert.deepEqual(real.body, fake.body);
      assert.deepEqual(real.body, { ok: true }, 'no hint, no link in the response');
      assert.ok(await until(() => s.mails.length === 1));
      assert.equal(s.mails[0].to, 'forgetful@example.com');
      assert.match(s.mails[0].subject, /Reset your Waypoint password/);
      assert.match(s.mails[0].link, /^http:\/\/localhost:5173\/reset-password#token=[\w-]{40,}$/, 'token is in the fragment, never the query string');
      assert.match(s.mails[0].html, /Choose a new password/);
    });

    it('stores only a hash of the reset token', async () => {
      const u = await s.signup({ email: 'hashed-token@example.com' });
      await s.send('POST', '/api/auth/forgot-password', { email: u.email });
      assert.ok(await until(() => s.mails.length === 1));
      const token = tokenFrom(s.mails[0]);
      const docs = await s.db.raw((d) => d.collection('passwordResets').find({}).toArray());
      assert.ok(docs.some((d) => d.tokenHash === hashToken(token)));
      assert.equal(JSON.stringify(docs).includes(token), false);
    });

    it('sends at most one email per minute per account', async () => {
      const u = await s.signup({ email: 'throttle@example.com' });
      for (let i = 0; i < 3; i++) assert.equal((await s.send('POST', '/api/auth/forgot-password', { email: u.email })).status, 200);
      await new Promise((r) => setTimeout(r, 100));
      assert.equal(s.mails.length, 1);
    });

    it('validates the email format', async () => {
      assert.equal((await s.send('POST', '/api/auth/forgot-password', { email: 'nope' })).status, 400);
      assert.equal((await s.send('POST', '/api/auth/forgot-password', {})).status, 400);
    });

    it('resets the password once, signs out every device, and notifies the owner', async () => {
      const u = await s.signup({ email: 'full-flow@example.com', password: 'old passphrase here' });
      const other = await s.send('POST', '/api/auth/login', { email: u.email, password: u.password });
      await s.send('POST', '/api/auth/forgot-password', { email: u.email });
      assert.ok(await until(() => s.mails.length === 1));
      const token = tokenFrom(s.mails[0]);

      assert.deepEqual((await s.send('POST', '/api/auth/reset-password/check', { token })).body, { valid: true });
      assert.deepEqual((await s.send('POST', '/api/auth/reset-password/check', { token: 'x'.repeat(43) })).body, { valid: false });

      const weak = await s.send('POST', '/api/auth/reset-password', { token, password: 'password123' });
      assert.equal(weak.status, 400);
      assert.equal(weak.body.error.field, 'password');
      assert.deepEqual((await s.send('POST', '/api/auth/reset-password/check', { token })).body, { valid: true }, 'a rejected password does not use the link up');

      const ok = await s.send('POST', '/api/auth/reset-password', { token, password: 'brand new passphrase' });
      assert.equal(ok.status, 200);

      assert.equal((await s.send('POST', '/api/auth/login', { email: u.email, password: u.password })).status, 401, 'old password no longer works');
      assert.equal((await s.send('POST', '/api/auth/login', { email: u.email, password: 'brand new passphrase' })).status, 200);
      assert.equal((await u.get('/api/auth/me')).body.user, null, 'the session from before the reset is gone');
      assert.equal((await s.send('GET', '/api/auth/me', undefined, { cookie: other.cookie.split(';')[0] })).body.user, null, 'including other devices');

      assert.deepEqual((await s.send('POST', '/api/auth/reset-password/check', { token })).body, { valid: false });
      const reuse = await s.send('POST', '/api/auth/reset-password', { token, password: 'yet another passphrase' });
      assert.equal(reuse.status, 400);
      assert.equal(reuse.body.error.code, 'invalid_token');

      assert.ok(await until(() => s.mails.some((m) => /password was changed/.test(m.subject))));
    });

    it('rejects expired, unknown and malformed tokens', async () => {
      const u = await s.signup({ email: 'expiry@example.com' });
      await s.send('POST', '/api/auth/forgot-password', { email: u.email });
      assert.ok(await until(() => s.mails.length === 1));
      const token = tokenFrom(s.mails[0]);
      await s.db.raw((d) => d.collection('passwordResets').updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } }));
      for (const t of [token, 'short', '', undefined, 12345, 'x'.repeat(43)]) {
        const r = await s.send('POST', '/api/auth/reset-password', { token: t, password: 'brand new passphrase' });
        assert.equal(r.status, 400, String(t));
        assert.equal(r.body.error.code, 'invalid_token');
      }
    });

    it('a newer reset link replaces the older one', async () => {
      const u = await s.signup({ email: 'two-links@example.com' });
      await s.send('POST', '/api/auth/forgot-password', { email: u.email });
      assert.ok(await until(() => s.mails.length === 1));
      await s.db.raw((d) => d.collection('users').updateOne({ email: u.email }, { $set: { resetRequestedAt: null } })); // skip the 1-minute gap
      await s.send('POST', '/api/auth/forgot-password', { email: u.email });
      assert.ok(await until(() => s.mails.length === 2));
      assert.deepEqual((await s.send('POST', '/api/auth/reset-password/check', { token: tokenFrom(s.mails[0]) })).body, { valid: false });
      assert.deepEqual((await s.send('POST', '/api/auth/reset-password/check', { token: tokenFrom(s.mails[1]) })).body, { valid: true });
    });

    it('unlocks a locked account (the new password is the proof of ownership)', async () => {
      const u = await s.signup({ email: 'unlock@example.com' });
      for (let i = 0; i < 5; i++) await s.send('POST', '/api/auth/login', { email: u.email, password: `bad ${i}` });
      assert.equal((await s.send('POST', '/api/auth/login', { email: u.email, password: u.password })).status, 429);
      await s.send('POST', '/api/auth/forgot-password', { email: u.email });
      assert.ok(await until(() => s.mails.length === 1));
      await s.send('POST', '/api/auth/reset-password', { token: tokenFrom(s.mails[0]), password: 'a fresh passphrase' });
      assert.equal((await s.send('POST', '/api/auth/login', { email: u.email, password: 'a fresh passphrase' })).status, 200);
    });
  });

  describe('development reset links', () => {
    const saved = { flag: process.env.AUTH_DEV_RESET_LINKS, env: process.env.NODE_ENV };
    afterEach(() => {
      for (const [k, v] of [['AUTH_DEV_RESET_LINKS', saved.flag], ['NODE_ENV', saved.env]]) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      }
    });

    it('returns the link in the response only when explicitly enabled and not in production', async () => {
      const u = await s.signup({ email: 'devlink@example.com' });
      const reset = () => s.db.raw((d) => d.collection('users').updateOne({ email: u.email }, { $set: { resetRequestedAt: null } }));

      assert.equal((await s.send('POST', '/api/auth/forgot-password', { email: u.email })).body.devLink, undefined, 'off by default');

      process.env.AUTH_DEV_RESET_LINKS = 'true';
      await reset();
      assert.match((await s.send('POST', '/api/auth/forgot-password', { email: u.email })).body.devLink, /#token=/);

      process.env.NODE_ENV = 'production';
      await reset();
      assert.equal((await s.send('POST', '/api/auth/forgot-password', { email: u.email })).body.devLink, undefined, 'ignored in production');
    });
  });

  describe('database', () => {
    it('enforces unique emails and expires sessions and reset tokens automatically', async () => {
      const idx = async (name) => s.db.raw((d) => d.collection(name).indexes());
      const users = await idx('users');
      assert.ok(users.some((i) => i.key.email === 1 && i.unique));
      for (const name of ['sessions', 'passwordResets']) {
        const indexes = await idx(name);
        assert.ok(indexes.some((i) => i.key.tokenHash === 1 && i.unique), `${name}: unique token hash`);
        assert.ok(indexes.some((i) => i.key.expiresAt === 1 && i.expireAfterSeconds === 0), `${name}: TTL index`);
      }
    });
  });
});

describe('rate limiting (per IP)', () => {
  let s;
  before(async () => { s = await startServer({ limits: {} }); });
  after(() => s.close());

  it('throttles forgot-password after 5 requests an hour', async () => {
    const codes = [];
    for (let i = 0; i < 7; i++) codes.push((await s.send('POST', '/api/auth/forgot-password', { email: `x${i}@example.com` })).status);
    assert.deepEqual(codes, [200, 200, 200, 200, 200, 429, 429]);
    const r = await s.send('POST', '/api/auth/forgot-password', { email: 'x@example.com' });
    assert.equal(r.body.error.code, 'rate_limited');
  });

  it('throttles repeated failed logins but not successful ones', async () => {
    const u = await s.signup({ email: 'throttled-login@example.com' });
    for (let i = 0; i < 6; i++) await s.send('POST', '/api/auth/login', { email: `nobody${i}@example.com`, password: 'bad password' });
    for (let i = 0; i < 3; i++) assert.equal((await s.send('POST', '/api/auth/login', { email: u.email, password: u.password })).status, 200, 'successes are not counted');
    let last;
    for (let i = 0; i < 20; i++) last = await s.send('POST', '/api/auth/login', { email: `nobody${i}@example.com`, password: 'bad password' });
    assert.equal(last.status, 429);
  });
});
