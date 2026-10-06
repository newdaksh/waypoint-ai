import { randomBytes } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { setMailSink } from '../src/auth/mailer.js';
import { createApp } from '../src/app.js';
import { createStore } from '../src/store.js';
import { sampleWorkspace } from './fixtures/sampleWorkspace.js';

// One real in-memory mongod per test process (the first run downloads the MongoDB binary, ~780 MB, once).
// Set TEST_MONGODB_URI to run against another MongoDB instead; each test still uses its own throwaway database.
let memory = null;
let users = 0;

async function acquireMongo() {
  users += 1;
  if (process.env.TEST_MONGODB_URI) return process.env.TEST_MONGODB_URI;
  memory ??= await MongoMemoryServer.create();
  return memory.getUri();
}

async function releaseMongo() {
  users -= 1;
  if (users === 0 && memory) {
    await memory.stop();
    memory = null;
  }
}

/** Open a store on a fresh database (dropped by the returned `drop`). */
export async function openStore() {
  const uri = await acquireMongo();
  const dbName = `waypoint_test_${randomBytes(6).toString('hex')}`;
  const store = await createStore({ uri, dbName }).init();
  return {
    store, uri, dbName,
    /** Another store instance on the same database, as a second server process would have. */
    another: () => createStore({ uri, dbName }).init(),
    /** Direct access to the database, bypassing the app. */
    async raw(fn) {
      const client = await MongoClient.connect(uri);
      try {
        return await fn(client.db(dbName));
      } finally {
        await client.close();
      }
    },
    async drop() {
      await store.close();
      const client = await MongoClient.connect(uri);
      await client.db(dbName).dropDatabase();
      await client.close();
      await releaseMongo();
    },
  };
}

const sessionCookie = (res) => res.headers.getSetCookie().find((c) => c.startsWith('wp_session='));

/**
 * Boot the real app on an ephemeral port against a throwaway database.
 * `limits` are the auth throttles (disabled by default so tests can sign up freely).
 */
export async function startServer({ limits = { disabled: true } } = {}) {
  const db = await openStore();
  const mails = []; // everything the app tried to email
  setMailSink(async (mail) => { mails.push(mail); });
  const server = (await createApp({ store: db.store, limits })).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  /** A fetch that speaks the app's protocol (JSON, CSRF header) with an optional session cookie. */
  const send = async (method, url, body, { cookie, headers } = {}) => {
    const init = { method, headers: { 'x-requested-with': 'waypoint', ...(cookie ? { cookie } : null), ...headers } };
    if (body !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetch(base + url, init);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, body: json, text, headers: res.headers, cookie: sessionCookie(res) };
  };

  /** Create an account and return a client bound to its session. */
  async function signup({ name = 'Test User', email = `user-${randomBytes(4).toString('hex')}@example.com`, password = 'correct horse battery', remember = false } = {}) {
    const res = await send('POST', '/api/auth/signup', { name, email, password, remember });
    if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${res.text}`);
    return bind({ user: res.body.user, email, password, cookie: res.cookie.split(';')[0] });
  }

  function bind(session) {
    const workspace = db.store.forUser(session.user.id, { name: session.user.name });
    const call = (method) => (url, body) => send(method, url, body, { cookie: session.cookie });
    return {
      ...session,
      get: call('GET'), post: call('POST'), patch: call('PATCH'),
      /** The user's workspace straight from the database. */
      ws: () => workspace.read(),
      /** Replace the (empty) workspace with realistic sample data, for testing the AI tasks. */
      seed: (extra = {}) => workspace.replace({ ...sampleWorkspace(), ...extra }),
      workspace,
    };
  }

  return {
    base, db, mails, send, signup, bind,
    store: db.store,
    get: (u) => send('GET', u),
    post: (u, b = {}) => send('POST', u, b),
    async close() {
      setMailSink(null);
      await new Promise((resolve) => server.close(resolve));
      await db.drop();
    },
  };
}
