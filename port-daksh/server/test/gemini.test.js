import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { ApiError } from '@google/genai';
import { completeJson, completeText, setGeminiClient, setTransport, toContents, toHttpError } from '../src/ai/client.js';
import { DEFAULT_DB, DEFAULT_MODEL, getApiKey, getConfig, getMongoUri, mongoHost, readEnv } from '../src/config.js';
import { HttpError } from '../src/errors.js';
import { startServer } from './helpers.js';

const reply = (text, extra = {}) => ({ candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP', ...extra }] });
const apiError = (status, message = 'x', gStatus = 'ERR') => new ApiError({ status, message: JSON.stringify({ error: { code: status, message, status: gStatus } }) });

/** A GoogleGenAI-shaped fake that records requests and answers from a queue. */
function fakeGemini(...answers) {
  const calls = [];
  return {
    calls,
    models: {
      async generateContent(req) {
        calls.push(req);
        const next = answers.length > 1 ? answers.shift() : answers[0];
        if (next instanceof Error) throw next;
        return next;
      },
    },
  };
}

const ENV_KEYS = ['GEMINI_API_KEY', 'gemini_api_key', 'GEMINI_MODEL', 'gemini_model'];
let savedEnv;
const saveEnv = () => { savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]])); };
const restoreEnv = () => ENV_KEYS.forEach((k) => (savedEnv[k] === undefined ? delete process.env[k] : (process.env[k] = savedEnv[k])));
const clearEnv = () => ENV_KEYS.forEach((k) => delete process.env[k]);

describe('config', () => {
  it('reads variables ignoring case (the .env may use lowercase names)', () => {
    assert.equal(readEnv('GEMINI_API_KEY', { gemini_api_key: 'abc' }), 'abc');
    assert.equal(readEnv('GEMINI_MODEL', { Gemini_Model: ' m ' }), 'm');
    assert.equal(readEnv('GEMINI_MODEL', {}), undefined);
  });

  it('treats blank values as unset', () => {
    assert.equal(readEnv('GEMINI_MODEL', { gemini_model: '' }), undefined);
    assert.equal(readEnv('GEMINI_MODEL', { gemini_model: '   ' }), undefined);
  });

  it('ignores the template placeholder as an API key', () => {
    for (const v of ['your_api_key_here', 'YOUR_API_KEY_HERE', 'your-api-key', 'your_gemini_api_key', 'changeme', '<key>', '']) {
      assert.equal(getApiKey({ gemini_api_key: v }), undefined, v);
    }
    assert.equal(getApiKey({ GEMINI_API_KEY: 'AIzaSyReal-key_123' }), 'AIzaSyReal-key_123');
  });

  it('defaults to gemini-3.5-flash-lite and honours GEMINI_MODEL', () => {
    saveEnv();
    try {
      clearEnv();
      assert.equal(DEFAULT_MODEL, 'gemini-3.5-flash-lite');
      assert.equal(getConfig().ai.model, 'gemini-3.5-flash-lite');
      process.env.gemini_model = ''; // exactly what the user's .env has
      assert.equal(getConfig().ai.model, 'gemini-3.5-flash-lite');
      process.env.gemini_model = 'gemini-2.5-flash';
      assert.equal(getConfig().ai.model, 'gemini-2.5-flash');
    } finally {
      restoreEnv();
    }
  });
});

describe('MongoDB config', () => {
  it('reads MONGODB_URI / MONGODB_DB ignoring case (as written in the .env)', () => {
    assert.equal(getMongoUri({ mongodb_uri: 'mongodb+srv://u:p@cluster.example.mongodb.net/' }), 'mongodb+srv://u:p@cluster.example.mongodb.net/');
    assert.equal(getMongoUri({ MONGODB_URI: 'mongodb://localhost:27017' }), 'mongodb://localhost:27017');
  });

  it('treats a missing, blank, malformed or template connection string as unset', () => {
    for (const v of [undefined, '', 'localhost:27017', 'postgres://x', 'mongodb+srv://<user>:<password>@<cluster-host>/']) {
      assert.equal(getMongoUri(v === undefined ? {} : { mongodb_uri: v }), undefined, String(v));
    }
  });

  it('defaults the database name to waypoint_ai', () => {
    assert.equal(DEFAULT_DB, 'waypoint_ai');
    const saved = { uri: process.env.mongodb_uri, db: process.env.mongodb_db, U: process.env.MONGODB_URI, D: process.env.MONGODB_DB };
    try {
      for (const k of ['mongodb_uri', 'mongodb_db', 'MONGODB_URI', 'MONGODB_DB']) delete process.env[k];
      assert.equal(getConfig().mongo.dbName, 'waypoint_ai');
      process.env.mongodb_db = 'other_db';
      assert.equal(getConfig().mongo.dbName, 'other_db');
    } finally {
      for (const [k, v] of [['mongodb_uri', saved.uri], ['mongodb_db', saved.db], ['MONGODB_URI', saved.U], ['MONGODB_DB', saved.D]]) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      }
    }
  });

  it('logs only the host, never the credentials', () => {
    const host = mongoHost('mongodb+srv://someuser:s3cret@cluster.example.mongodb.net/');
    assert.equal(host, 'cluster.example.mongodb.net');
    assert.equal(host.includes('s3cret') || host.includes('someuser'), false);
    assert.equal(mongoHost('not a url'), 'unknown host');
  });
});

describe('Gemini transport', () => {
  beforeEach(() => { saveEnv(); clearEnv(); setTransport(null); });
  afterEach(() => { setGeminiClient(null); restoreEnv(); });

  it('sends the system prompt, JSON mode and the default model', async () => {
    const gemini = fakeGemini(reply('{"ok":true}'));
    setGeminiClient(gemini);
    assert.deepEqual(await completeJson('PROMPT', 2500), { ok: true });

    const [req] = gemini.calls;
    assert.equal(req.model, 'gemini-3.5-flash-lite');
    assert.deepEqual(req.contents, [{ role: 'user', parts: [{ text: 'PROMPT' }] }]);
    assert.match(req.config.systemInstruction, /analysis engine of a career intelligence platform/);
    assert.equal(req.config.responseMimeType, 'application/json');
    assert.equal(req.config.maxOutputTokens, 3500, 'requested tokens plus headroom');
    assert.equal(req.config.temperature, 0.3);
  });

  it('uses GEMINI_MODEL when set', async () => {
    process.env.gemini_model = 'gemini-2.5-flash';
    const gemini = fakeGemini(reply('{}'));
    setGeminiClient(gemini);
    await completeJson('p');
    assert.equal(gemini.calls[0].model, 'gemini-2.5-flash');
  });

  it('extracts JSON from fenced or chatty replies and ignores thought parts', async () => {
    const gemini = fakeGemini({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'hidden reasoning', thought: true }, { text: 'Here:\n```json\n{"a":1}\n```' }] } }],
    });
    setGeminiClient(gemini);
    assert.deepEqual(await completeJson('p'), { a: 1 });
  });

  it('retries once with a bigger budget when the reply is cut off', async () => {
    const gemini = fakeGemini(reply('{"a":', { finishReason: 'MAX_TOKENS' }), reply('{"a":1}'));
    setGeminiClient(gemini);
    assert.deepEqual(await completeJson('p', 2000), { a: 1 });
    assert.deepEqual(gemini.calls.map((c) => c.config.maxOutputTokens), [3000, 4000]);
  });

  it('retries once on unreadable or empty output, then reports a retryable error', async () => {
    for (const bad of [reply('not json'), reply(''), { candidates: [] }]) {
      const gemini = fakeGemini(bad);
      setGeminiClient(gemini);
      await assert.rejects(completeJson('p'), (e) => e instanceof HttpError && e.status === 502 && e.canRetry && /couldn't read/.test(e.message));
      assert.equal(gemini.calls.length, 2);
    }
  });

  it('reports blocked prompts and safety-stopped answers as declined (not retryable)', async () => {
    for (const blocked of [{ promptFeedback: { blockReason: 'SAFETY' } }, reply('', { finishReason: 'SAFETY' }), reply('', { finishReason: 'PROHIBITED_CONTENT' })]) {
      const gemini = fakeGemini(blocked);
      setGeminiClient(gemini);
      await assert.rejects(completeJson('p'), (e) => e.status === 502 && e.canRetry === false && /declined/.test(e.message));
      assert.equal(gemini.calls.length, 1, 'a refusal is not retried');
    }
  });

  it('chat: maps roles to user/model, merges consecutive turns, and returns plain text', async () => {
    const gemini = fakeGemini(reply('  Learn pytest first.  '));
    setGeminiClient(gemini);
    const text = await completeText({
      system: 'SYS',
      messages: [{ role: 'user', content: 'a' }, { role: 'user', content: 'b' }, { role: 'assistant', content: 'c' }, { role: 'user', content: 'd' }],
    });
    assert.equal(text, 'Learn pytest first.');
    const [req] = gemini.calls;
    assert.deepEqual(req.contents.map((c) => [c.role, c.parts.map((p) => p.text)]), [['user', ['a', 'b']], ['model', ['c']], ['user', ['d']]]);
    assert.equal(req.config.systemInstruction, 'SYS');
    assert.equal(req.config.responseMimeType, undefined, 'chat is free text, not JSON mode');
    assert.equal(req.config.temperature, 0.7);
  });

  it('chat: keeps a truncated reply but rejects an empty one', async () => {
    setGeminiClient(fakeGemini(reply('Half an ans', { finishReason: 'MAX_TOKENS' })));
    assert.equal(await completeText({ system: 's', messages: [{ role: 'user', content: 'q' }] }), 'Half an ans');
    setGeminiClient(fakeGemini(reply('   ')));
    await assert.rejects(completeText({ system: 's', messages: [{ role: 'user', content: 'q' }] }), /couldn't respond/);
  });

  it('is "not configured" without a real key, and the placeholder does not count', async () => {
    for (const setup of [() => {}, () => { process.env.gemini_api_key = 'your_api_key_here'; }]) {
      clearEnv();
      setup();
      await assert.rejects(completeJson('p'), (e) => e.status === 503 && e.canRetry === false && /GEMINI_API_KEY/.test(e.message));
    }
  });
});

describe('Gemini error mapping', () => {
  const cases = [
    [apiError(429, 'Quota exceeded', 'RESOURCE_EXHAUSTED'), 429, true, /Rate limit/],
    [apiError(400, 'API key not valid. Please pass a valid API key.', 'INVALID_ARGUMENT'), 503, false, /rejected this server's API key/],
    [apiError(403, 'Permission denied', 'PERMISSION_DENIED'), 503, false, /API key/],
    [apiError(401, 'Unauthenticated', 'UNAUTHENTICATED'), 503, false, /API key/],
    [apiError(404, 'models/x is not found', 'NOT_FOUND'), 503, false, /gemini-3.5-flash-lite.*GEMINI_MODEL/],
    [apiError(400, 'User location is not supported for the API use.', 'FAILED_PRECONDITION'), 503, false, /region/],
    [apiError(503, 'The model is overloaded.', 'UNAVAILABLE'), 502, true, /busy/],
    [apiError(500, 'Internal', 'INTERNAL'), 502, true, /busy/],
    [apiError(400, 'something else', 'INVALID_ARGUMENT'), 502, true, /returned an error/],
    [Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }), 504, true, /timed out/],
    [new TypeError('fetch failed'), 502, true, /reach the AI service/],
  ];
  for (const [err, status, canRetry, message] of cases) {
    it(`${err.name} ${err.status ?? ''} ${String(err.message).slice(0, 40)}`, () => {
      saveEnv();
      clearEnv();
      try {
        const out = toHttpError(err);
        assert.equal(out.status, status);
        assert.equal(out.canRetry, canRetry);
        assert.match(out.message, message);
      } finally {
        restoreEnv();
      }
    });
  }

  it('passes HttpErrors through untouched', () => {
    const e = new HttpError(418, 'teapot');
    assert.equal(toHttpError(e), e);
  });

  it('uses the caller-supplied wording for generic failures', () => {
    assert.equal(toHttpError(new Error('boom'), "The assistant couldn't respond. Try again.").message, "The assistant couldn't respond. Try again.");
  });
});

describe('toContents', () => {
  it('handles an empty history', () => assert.deepEqual(toContents([]), []));
});

describe('API with the real Gemini transport', () => {
  let s;
  let u;
  before(async () => { s = await startServer(); u = await s.signup(); await u.seed(); });
  after(() => s.close());
  beforeEach(() => { saveEnv(); clearEnv(); setTransport(null); });
  afterEach(() => { setGeminiClient(null); restoreEnv(); });

  it('health reports the provider, model and whether a key is configured', async () => {
    let h = (await s.get('/api/health')).body;
    assert.deepEqual([h.provider, h.model, h.aiKeyConfigured], ['gemini', 'gemini-3.5-flash-lite', false]);
    process.env.gemini_api_key = 'AIzaSyReal-key_123';
    h = (await s.get('/api/health')).body;
    assert.equal(h.aiKeyConfigured, true);
    assert.equal(JSON.stringify(h).includes('AIzaSyReal'), false, 'the key is never exposed');
  });

  it('AI endpoints return a clear, non-retryable error until a key is set', async () => {
    process.env.gemini_api_key = 'your_api_key_here';
    const r = await u.post('/api/ai/ats', { jobId: 'j1' });
    assert.equal(r.status, 503);
    assert.equal(r.body.error.canRetry, false);
    assert.match(r.body.error.message, /GEMINI_API_KEY/);
  });

  it('runs a whole task through the Gemini request path', async () => {
    const demoAts = (await u.get('/api/workspace')).body.atsBy.j1;
    const gemini = fakeGemini(reply(JSON.stringify({ ...demoAts, score: 91 })));
    setGeminiClient(gemini);
    const r = await u.post('/api/ai/ats', { jobId: 'j1' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal((await u.get('/api/workspace')).body.atsBy.j1.score, 91);
    assert.match(gemini.calls[0].contents[0].parts[0].text, /Simulate a typical ATS/);
  });
});
