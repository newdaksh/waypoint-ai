import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { applyPatch } from '@waypoint/shared';
import { emptyWorkspace, upgradeOf } from '../src/domain/workspace.js';
import { buildUpdate } from '../src/store.js';
import { sampleWorkspace } from './fixtures/sampleWorkspace.js';
import { openStore } from './helpers.js';

const withoutStamp = (workspace) => {
  const copy = { ...workspace };
  delete copy.updatedAt; // changes on every write
  return copy;
};

describe('buildUpdate', () => {
  it('maps set / merge / null to $set and $unset on exact paths', () => {
    const u = buildUpdate({ set: { a: 1 }, merge: { map: { x: 2, y: null } } });
    assert.equal(u.$set.a, 1);
    assert.equal(u.$set['map.x'], 2);
    assert.deepEqual(u.$unset, { 'map.y': '' });
    assert.ok(u.$set.updatedAt);
  });

  it('folds a merge into a replacement of the same key (a path cannot be both)', () => {
    const u = buildUpdate({ set: { map: { keep: 1, drop: 2 } }, merge: { map: { add: 3, drop: null } } });
    assert.deepEqual(u.$set.map, { keep: 1, add: 3 });
    assert.equal(Object.keys(u.$set).some((k) => k.startsWith('map.')), false);
    assert.equal(u.$unset, undefined);
  });

  it('refuses keys and ids that could address other fields', () => {
    for (const patch of [
      { merge: { answers: { 'a.b': 1 } } }, { merge: { answers: { $x: 1 } } }, { set: { _id: 'x' } },
      { set: { 'a.b': 1 } }, { set: { $where: 1 } }, { merge: { 'a.b': { x: 1 } } },
    ]) assert.throws(() => buildUpdate(patch), /Invalid/, JSON.stringify(patch));
  });
});

describe('emptyWorkspace', () => {
  it('has no personal or sample content, and every key the app relies on', () => {
    const w = emptyWorkspace({ name: 'Sam' });
    assert.equal(w.profile.name, 'Sam');
    assert.deepEqual([w.resumes.map((r) => r.text), w.jobs, w.apps, w.chat, w.questions], [[''], [], [], [], []]);
    for (const key of Object.keys(sampleWorkspace())) assert.ok(key in w, `missing key: ${key}`);
  });
});

describe('upgradeOf (workspaces stored before there were several resumes)', () => {
  it('leaves a current workspace alone', () => {
    assert.equal(upgradeOf(emptyWorkspace()), null);
    assert.equal(upgradeOf(sampleWorkspace()), null);
  });

  it('turns the single resume and its versions into resumes, and marks its results as made from it', () => {
    const { $set, $unset } = upgradeOf({
      version: 2,
      resumeText: 'the original resume',
      versions: [{ id: 'master', name: 'Master resume', note: 'Your original resume', created: '2026-01-01', text: '' }, { id: 'v1', name: 'v1 · Acme', note: 'Tailored', created: '2026-02-01', text: 'tailored text' }],
      analysis: { summary: 's' },
      atsBy: { j1: { score: 70 } },
      tailorBy: {},
      questions: [{ question: 'q' }],
      roadmap: null,
      claimTests: { 0: { question: 'q' } },
    });
    assert.deepEqual($set.resumes.map((r) => [r.id, r.name, r.text]), [['master', 'Master resume', 'the original resume'], ['v1', 'v1 · Acme', 'tailored text']]);
    assert.equal($set.activeResumeId, 'master');
    assert.deepEqual($set.analysisBy, { master: { summary: 's' } });
    assert.deepEqual($set.madeFrom, { questions: 'master', claimTests: 'master', 'atsBy:j1': 'master' });
    assert.deepEqual(Object.keys($unset).sort(), ['analysis', 'resumeText', 'versions']);
  });
});

describe('MongoDB store (per-user workspaces)', () => {
  let db;
  let alice;
  before(async () => {
    db = await openStore();
    alice = db.store.forUser('alice-id', { name: 'Alice' });
  });
  after(() => db.drop());

  it('creates an empty workspace on first use, in the "workspaces" collection, keyed by user id', async () => {
    const ws = await alice.read();
    assert.equal(ws.profile.name, 'Alice');
    assert.deepEqual(ws.jobs, []);
    const docs = await db.raw((d) => d.collection('workspaces').find().toArray());
    assert.deepEqual(docs.map((d) => d._id), ['alice-id']);
    assert.equal('_id' in ws, false);
  });

  it('is idempotent: concurrent first use and restarts leave exactly one untouched document', async () => {
    await alice.patch({ set: { bulletInput: 'edited bullet' } });
    const others = await Promise.all([db.another(), db.another()]);
    await Promise.all(others.flatMap((o) => [o.forUser('alice-id', { name: 'Alice' }).ensure(), o.forUser('alice-id', { name: 'Alice' }).ensure()]));
    await Promise.all(others.map((o) => o.close()));
    assert.equal((await alice.read()).bulletInput, 'edited bullet');
    assert.equal(await db.raw((d) => d.collection('workspaces').countDocuments({ _id: 'alice-id' })), 1);
  });

  it('keeps every user’s workspace separate', async () => {
    const bob = db.store.forUser('bob-id', { name: 'Bob' });
    await bob.patch({ set: { bulletInput: 'only bob' }, merge: { answers: { 1: 'bob answer' } } });
    await alice.patch({ merge: { answers: { 1: 'alice answer' } } });
    assert.equal((await bob.read()).answers[1], 'bob answer');
    assert.equal((await alice.read()).answers[1], 'alice answer');
    assert.equal((await alice.read()).bulletInput, 'edited bullet');
    assert.equal((await bob.read()).profile.name, 'Bob');
  });

  it('backfills top-level keys that a newer version of the app added', async () => {
    await db.raw((d) => d.collection('workspaces').updateOne({ _id: 'alice-id' }, { $unset: { prefs: '', insights: '' } }));
    const reopened = await db.another();
    try {
      const mine = reopened.forUser('alice-id', { name: 'Alice' });
      await mine.ensure();
      const ws = await mine.read();
      assert.deepEqual(ws.prefs, emptyWorkspace().prefs);
      assert.equal(ws.insights, null);
      assert.equal(ws.bulletInput, 'edited bullet', 'existing data is kept');
    } finally {
      await reopened.close();
    }
  });

  it('upgrades a workspace stored by the single-resume version of the app, on first read or write', async () => {
    const legacy = (resumeText) => {
      const { resumes, activeResumeId, analysisBy, madeFrom, ...rest } = emptyWorkspace({ name: 'Old' });
      return { ...rest, version: 2, resumeText, analysis: { summary: 'kept' }, atsBy: { j1: { score: 61 } }, versions: [{ id: 'master', name: 'Master resume', text: '' }, { id: 'v9', name: 'v1 · Acme', text: 'tailored' }] };
    };
    await db.raw((d) => d.collection('workspaces').insertMany([{ _id: 'old-reader', ...legacy('read me') }, { _id: 'old-writer', ...legacy('patch me') }]));

    const read = await db.store.forUser('old-reader').read();
    assert.deepEqual(read.resumes.map((r) => [r.id, r.text]), [['master', 'read me'], ['v9', 'tailored']]);
    assert.deepEqual([read.activeResumeId, read.analysisBy.master.summary, read.madeFrom['atsBy:j1']], ['master', 'kept', 'master']);
    assert.deepEqual(['resumeText', 'versions', 'analysis'].filter((k) => k in read), [], 'the old keys are gone');
    assert.equal(read.profile.name, 'Old');

    // A write that arrives before any read must not strand the old resume either.
    const written = await db.store.forUser('old-writer').patch({ set: { bulletInput: 'x' } });
    assert.equal(written.resumes[0].text, 'patch me');
    assert.equal(written.bulletInput, 'x');
    await db.raw((d) => d.collection('workspaces').deleteMany({ _id: { $in: ['old-reader', 'old-writer'] } }));
  });

  it('recreates an empty workspace if the document was deleted', async () => {
    await db.raw((d) => d.collection('workspaces').deleteOne({ _id: 'alice-id' }));
    const ws = await alice.patch({ set: { bulletInput: 'after delete' } });
    assert.equal(ws.bulletInput, 'after delete');
    assert.equal(ws.profile.name, 'Alice');
    assert.deepEqual(ws.resumes.map((r) => r.text), ['']);
  });

  it('applies patches exactly like the shared applyPatch (what the client does locally)', async () => {
    const patches = [
      { set: { bulletInput: 'x', jobs: [] }, merge: { answers: { 1: 'a', 2: 'b' } } },
      { merge: { answers: { 1: null }, src: { 'ats:j9': 'live' } } },
      { set: { answers: { fresh: 'only' } } },
      { set: { claimTests: {} }, merge: { claimTests: { 0: { question: 'q', answer: '' } } } }, // replace + merge, same key
      { merge: { tailorBy: { j2: { text: 't', changes: [], notIncluded: [] } }, prefs: { accent: 'Violet' } } },
      { merge: { brandNewMap: { k: 1 } } },
      {},
    ];
    await alice.replace(emptyWorkspace({ name: 'Alice' }));
    let expected = withoutStamp(await alice.read());
    for (const patch of patches) {
      expected = applyPatch(expected, patch);
      assert.deepEqual(withoutStamp(await alice.patch(patch)), expected, JSON.stringify(patch));
    }
  });

  it('concurrent patches to different entries never overwrite each other', async () => {
    await alice.replace(emptyWorkspace({ name: 'Alice' }));
    await Promise.all(Array.from({ length: 25 }, (_, i) => alice.patch({ merge: { answers: { [`q${i}`]: `answer ${i}` } } })));
    const { answers } = await alice.read();
    assert.equal(Object.keys(answers).length, 25);
    assert.equal(answers.q24, 'answer 24');
  });

  it('concurrent edits through two store instances are both kept', async () => {
    const secondInstance = await db.another();
    try {
      const other = secondInstance.forUser('alice-id', { name: 'Alice' });
      await Promise.all([
        alice.patch({ set: { bulletInput: 'from instance A' } }),
        other.patch({ set: { safetyInput: 'from instance B' } }),
        alice.patch({ merge: { src: { a: 'x' } } }),
        other.patch({ merge: { src: { b: 'y' } } }),
      ]);
      const ws = await alice.read();
      assert.equal(ws.bulletInput, 'from instance A');
      assert.equal(ws.safetyInput, 'from instance B');
      assert.deepEqual([ws.src.a, ws.src.b], ['x', 'y']);
    } finally {
      await secondInstance.close(); // an open client would keep the test process alive
    }
  });

  it('appends chat messages atomically and keeps only the latest 200', async () => {
    await alice.patch({ set: { chat: [] } });
    await Promise.all(Array.from({ length: 30 }, (_, i) => alice.appendChat({ role: 'user', content: `m${i}` })));
    assert.equal((await alice.read()).chat.length, 30, 'no message lost to a race');

    await alice.patch({ set: { chat: Array.from({ length: 200 }, (_, i) => ({ role: 'user', content: `old${i}` })) } });
    const ws = await alice.appendChat({ role: 'assistant', content: 'newest' });
    assert.equal(ws.chat.length, 200);
    assert.equal(ws.chat.at(-1).content, 'newest');
    assert.equal(ws.chat[0].content, 'old1', 'the oldest message was dropped');
  });

  it('replace swaps the whole workspace; remove deletes it', async () => {
    await alice.replace({ ...sampleWorkspace(), bulletInput: 'replaced' });
    const ws = await alice.read();
    assert.equal(ws.bulletInput, 'replaced');
    assert.equal(ws.jobs.length, 4);
    await alice.remove();
    assert.equal(await db.raw((d) => d.collection('workspaces').countDocuments({ _id: 'alice-id' })), 0);
  });

  it('stores nothing outside its own collection', async () => {
    const names = (await db.raw((d) => d.listCollections({}, { nameOnly: true }).toArray())).map((c) => c.name);
    assert.deepEqual(names, ['workspaces']);
  });
});
