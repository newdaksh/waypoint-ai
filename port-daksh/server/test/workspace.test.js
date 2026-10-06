import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import { startServer } from './helpers.js';

describe('workspace API', () => {
  let s;
  let u;
  before(async () => { s = await startServer(); u = await s.signup({ name: 'Workspace Tester' }); });
  after(() => s.close());

  it('a new account starts completely empty, never with sample data', async () => {
    const { status, body } = await u.get('/api/workspace');
    assert.equal(status, 200);
    assert.equal(body.profile.name, 'Workspace Tester');
    assert.equal(body.resumeText, '');
    assert.deepEqual([body.jobs, body.apps, body.questions, body.chat], [[], [], [], []]);
    assert.deepEqual([body.analysis, body.roadmap, body.bullets, body.safety, body.insights], [null, null, null, null, null]);
    assert.deepEqual([body.atsBy, body.decoderBy, body.gapBy, body.proofBy, body.tailorBy, body.priorityBy, body.answers, body.evals, body.claimTests, body.src], [{}, {}, {}, {}, {}, {}, {}, {}, {}, {}]);
    assert.deepEqual(body.prefs, { accent: 'Indigo', sidebar: 'Ink', aiTone: 'Analyst' });
    assert.equal(body.versions.length, 1);
    assert.equal(body.versions[0].id, 'master');
    assert.equal('_id' in body, false);
  });

  it('applies set + merge patches and persists them in MongoDB', async () => {
    const profile = { ...(await u.ws()).profile, name: 'Test User', role: 'Data Analyst' };
    const r = await u.patch('/api/workspace', { set: { profile }, merge: { answers: { 0: 'my answer' }, prefs: { accent: 'Emerald' } } });
    assert.equal(r.status, 200);

    const ws = (await u.get('/api/workspace')).body;
    assert.equal(ws.profile.name, 'Test User');
    assert.equal(ws.answers[0], 'my answer');
    assert.equal(ws.prefs.accent, 'Emerald');
    assert.equal(ws.prefs.sidebar, 'Ink', 'untouched prefs survive a merge');

    // A second store instance (as another server process would be) reads the same data from the database.
    const other = await s.db.another();
    try {
      const seen = await other.forUser(u.user.id).read();
      assert.equal(seen.profile.role, 'Data Analyst');
      assert.equal(seen.prefs.accent, 'Emerald');
    } finally {
      await other.close();
    }
  });

  it('deletes map entries with null', async () => {
    await u.patch('/api/workspace', { merge: { answers: { 0: null } } });
    assert.equal((await u.get('/api/workspace')).body.answers[0], undefined);
  });

  it('rejects keys the client may not write (AI-derived data, ids)', async () => {
    for (const patch of [{ set: { analysis: {} } }, { merge: { atsBy: { j1: {} } } }, { set: { evals: {} } }, { set: { _id: 'x' } }]) {
      const r = await u.patch('/api/workspace', patch);
      assert.equal(r.status, 400, JSON.stringify(patch));
      assert.equal(r.body.error.canRetry, false);
    }
  });

  it('rejects entry ids that could address other database fields', async () => {
    for (const id of ['a.b', '$set', '__proto__.x', 'a b', '', 'x'.repeat(81)]) {
      const r = await u.patch('/api/workspace', { merge: { answers: { [id]: 'x' } } });
      assert.equal(r.status, 400, JSON.stringify(id));
    }
    assert.deepEqual(Object.keys((await u.get('/api/workspace')).body.answers), [], 'nothing was written');
  });

  it('rejects malformed values', async () => {
    const cases = [
      { set: { resumeText: 42 } },
      { set: { jobs: [{ id: 'x' }] } },
      { set: { chat: [{ role: 'system', content: 'hi' }] } },
      { merge: { prefs: { accent: 'Hotpink' } } },
      { set: 'nope' },
    ];
    for (const patch of cases) assert.equal((await u.patch('/api/workspace', patch)).status, 400, JSON.stringify(patch));
    const bad = await fetch(`${s.base}/api/workspace`, { method: 'PATCH', headers: { cookie: u.cookie, 'x-requested-with': 'waypoint', 'content-type': 'application/json' }, body: '{oops' });
    assert.equal(bad.status, 400);
  });

  it('has no reset-to-demo endpoint any more', async () => {
    assert.equal((await u.post('/api/workspace/reset')).status, 404);
  });

  it('returns JSON 404s under /api', async () => {
    const r = await u.get('/api/nope');
    assert.equal(r.status, 404);
    assert.ok(r.body.error.message);
  });
});

describe('no demo data ships with the app', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

  it('the runtime source (server, client, shared) contains none of the old sample persona', () => {
    const files = ['server/src', 'client/src', 'shared/src'].flatMap((d) => walk(path.join(root, d)));
    assert.ok(files.length > 30);
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      assert.doesNotMatch(text, /Aarav|Kitebyte|aaravm|Expense Splitter|Pallet Labs|Northwind Pay|Cobalt Ledger/, path.relative(root, file));
    }
  });

  it('there is no demo seed module and no demo-labelled UI text', () => {
    assert.equal(fs.existsSync(path.join(root, 'server/src/domain/demo.js')), false);
    const ui = ['client/src/pages', 'client/src/components'].flatMap((d) => walk(path.join(root, d))).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    assert.doesNotMatch(ui, /\bdemo\b/i, 'no "demo" wording anywhere in the UI');
  });
});
