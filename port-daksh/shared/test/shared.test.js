import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analytics, applyPatch, mergePatches, priorityOf } from '../src/index.js';

describe('applyPatch', () => {
  const base = { a: 1, map: { x: 1, y: 2 }, list: [1] };

  it('sets whole keys and merges map entries', () => {
    const next = applyPatch(base, { set: { a: 2, list: [] }, merge: { map: { y: 9, z: 3 } } });
    assert.deepEqual(next, { a: 2, map: { x: 1, y: 9, z: 3 }, list: [] });
    assert.deepEqual(base.map, { x: 1, y: 2 }, 'input is not mutated');
  });

  it('deletes entries with null and creates missing maps', () => {
    assert.deepEqual(applyPatch(base, { merge: { map: { x: null } } }).map, { y: 2 });
    assert.deepEqual(applyPatch(base, { merge: { fresh: { k: 1 } } }).fresh, { k: 1 });
  });

  it('applies set before merge on the same key', () => {
    assert.deepEqual(applyPatch(base, { set: { map: {} }, merge: { map: { k: 1 } } }).map, { k: 1 });
  });

  it('tolerates empty patches', () => {
    assert.deepEqual(applyPatch(base, undefined), base);
    assert.deepEqual(applyPatch(base, {}), base);
  });
});

describe('mergePatches', () => {
  const patches = [
    [{ set: { a: 1 }, merge: { m: { x: 1 } } }, { set: { b: 2 }, merge: { m: { y: 2 } } }],
    [{ merge: { m: { x: 1 } } }, { set: { m: { z: 3 } } }], // later set supersedes earlier merge
    [{ set: { m: { z: 3 } } }, { merge: { m: { x: 1 } } }], // later merge builds on earlier set
    [{ merge: { m: { x: 1 } } }, { merge: { m: { x: null } } }],
    [{ set: { a: 1 } }, { set: { a: 2 }, merge: { m: { q: 1 } } }],
  ];
  it('is equivalent to applying the patches in order', () => {
    const start = { a: 0, b: 0, m: { keep: true } };
    for (const [p, q] of patches) {
      assert.deepEqual(applyPatch(start, mergePatches(p, q)), applyPatch(applyPatch(start, p), q), JSON.stringify([p, q]));
    }
  });
});

describe('priorityOf', () => {
  it('weights 35/30/15/20 and labels by score and effort', () => {
    assert.deepEqual(priorityOf({ resume: 82, skill: 76, experience: 85, goal: 90, effort: 'Low' }), { score: 82, label: 'Apply now' });
    assert.equal(priorityOf({ resume: 82, skill: 76, experience: 85, goal: 90, effort: 'High' }).label, 'Tailor, then apply', 'high effort blocks "Apply now"');
    assert.equal(priorityOf({ resume: 54, skill: 42, experience: 50, goal: 40, effort: 'High' }).label, 'Low priority');
    assert.equal(priorityOf({ resume: 61, skill: 52, experience: 70, goal: 65, effort: 'High' }).label, 'Upskill first');
    assert.equal(priorityOf(undefined), null);
  });
});

describe('analytics', () => {
  const ev = (...s) => s.map((status, i) => ({ status, date: `2026-01-0${i + 1}` }));
  const app = (id, version, match, category, status, ...events) => ({ id, version, match, category, status, events: ev(...events) });
  const apps = [
    app('1', 'v1', 85, 'Backend', 'Offer', 'Applied', 'Screening', 'Interview', 'Offer'),
    app('2', 'v1', 75, 'Backend', 'Interview', 'Applied', 'Interview'),
    app('3', 'v2', 60, 'Data', 'Rejected', 'Applied', 'Rejected'),
    app('4', 'v2', 72, 'Python', 'Applied', 'Applied'),
    app('5', '', 70, 'Backend', 'Saved', 'Saved'),
  ];
  const versions = [{ id: 'v1', name: 'v1 · Backend' }, { id: 'v2', name: 'v2 · Python' }];
  const a = analytics(apps, versions);

  it('counts only sent applications', () => {
    assert.equal(a.sent, 4);
    assert.equal(a.interviews, 2);
    assert.equal(a.offers, 1);
    assert.equal(a.rejections, 1);
    assert.equal(a.responseRate, 75); // 3 of 4 responded or were rejected
    assert.equal(a.interviewRate, 50);
    assert.equal(a.avgMatch, 73);
    assert.equal(a.smallSample, true);
  });

  it('groups by version, match band and category', () => {
    assert.deepEqual(a.byVersion.map((g) => [g.name, g.n, g.interviews, g.rate]), [['v1 · Backend', 2, 2, 100], ['v2 · Python', 2, 0, 0]]);
    assert.deepEqual(a.byMatch.map((g) => [g.label, g.n]), [['80+', 1], ['70–79', 2], ['Under 70', 1]]);
    assert.equal(a.bestVersion.label, 'v1');
    assert.equal(a.bestCat.label, 'Backend');
  });

  it('builds a monotonic funnel', () => {
    assert.deepEqual(a.funnel.map((f) => f.n), [4, 2, 2, 1]);
  });

  it('handles an empty list', () => {
    const e = analytics([], versions);
    assert.equal(e.sent, 0);
    assert.equal(e.responseRate, 0);
    assert.equal(e.avgMatch, 0);
  });
});
