import { STAGE } from './constants.js';

const pct = (x, y) => (y ? Math.round((100 * x) / y) : 0);

/** Highest pipeline stage an application has reached. */
export const reached = (app) => Math.max(0, ...app.events.map((e) => STAGE[e.status] ?? 0));

/**
 * Aggregate application statistics. Saved (not yet sent) applications are excluded.
 * Pure function: used by the dashboard / analytics screens and by the AI insight + chat context.
 */
export function analytics(apps, versions) {
  const sent = apps.filter((a) => a.status !== 'Saved');
  const responded = sent.filter((a) => reached(a) >= 2 || a.status === 'Rejected');
  const interviews = sent.filter((a) => reached(a) >= 3);
  const offers = sent.filter((a) => reached(a) >= 4);
  const rejections = sent.filter((a) => a.status === 'Rejected');
  const avgMatch = sent.length ? Math.round(sent.reduce((s, a) => s + (a.match || 0), 0) / sent.length) : 0;

  const group = (keyFn, labels) =>
    labels
      .map((label) => {
        const g = sent.filter((a) => keyFn(a) === label);
        const hit = g.filter((a) => reached(a) >= 3).length;
        return { label, n: g.length, interviews: hit, rate: pct(hit, g.length) };
      })
      .filter((g) => g.n);

  const byVersion = group((a) => a.version, versions.map((v) => v.id)).map((g) => ({
    ...g,
    name: (versions.find((v) => v.id === g.label) || {}).name || g.label,
  }));
  const byMatch = group((a) => (a.match >= 80 ? '80+' : a.match >= 70 ? '70–79' : 'Under 70'), ['80+', '70–79', 'Under 70']);
  const byCat = group((a) => a.category || 'Other', [...new Set(sent.map((a) => a.category || 'Other'))]);
  const funnel = [['Applied', 1], ['Screening', 2], ['Interview', 3], ['Offer', 4]].map(([label, stage]) => ({
    label,
    n: sent.filter((a) => reached(a) >= stage).length,
  }));
  const best = (arr) => arr.filter((g) => g.n >= 2).sort((a, b) => b.rate - a.rate || b.n - a.n)[0];

  return {
    sent: sent.length,
    responded: responded.length,
    interviews: interviews.length,
    offers: offers.length,
    rejections: rejections.length,
    responseRate: pct(responded.length, sent.length),
    interviewRate: pct(interviews.length, sent.length),
    offerRate: pct(offers.length, sent.length),
    avgMatch,
    byVersion,
    byMatch,
    byCat,
    funnel,
    bestVersion: best(byVersion),
    bestCat: best(byCat),
    smallSample: sent.length < 20,
  };
}
