import { AutoGrid, Button, Card, MonoLabel, Notice, Row, Stack } from '../components/ui.jsx';
import { statsOf } from '../lib/derive.js';
import { useTasks } from '../state/TaskContext.jsx';
import { useWorkspace } from '../state/WorkspaceContext.jsx';

/** One horizontal-bar breakdown, e.g. interview rate per resume version. */
function RateCard({ title, rows, color }) {
  return (
    <Card pad={20} gap={12}>
      <MonoLabel>{title}</MonoLabel>
      {rows.map((g) => (
        <div key={g.label} style={{ display: 'grid', gridTemplateColumns: '130px minmax(0,1fr) 92px', gap: 12, alignItems: 'center', fontSize: 13 }}>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={g.name || g.label}>{g.name || g.label}</span>
          <div style={{ height: 10, borderRadius: 9, background: '#f1f3f5' }}>
            <div style={{ height: 10, borderRadius: 9, background: color, width: `${g.rate}%` }} />
          </div>
          <span className="mono" style={{ textAlign: 'right', fontSize: 12 }}>{g.rate}% · {g.interviews}/{g.n}</span>
        </div>
      ))}
    </Card>
  );
}

export default function Analytics() {
  const { ws } = useWorkspace();
  const tasks = useTasks();
  const st = statsOf(ws);
  const maxFunnel = Math.max(1, ...st.funnel.map((f) => f.n));

  const insights = [];
  if (st.bestVersion) {
    const v = st.bestVersion;
    insights.push(`${v.name} was used for ${v.n} applications and resulted in ${v.interviews} interview${v.interviews === 1 ? '' : 's'} (${v.rate}%).`);
  }
  const bestMatch = [...st.byMatch].sort((x, y) => y.rate - x.rate)[0];
  if (bestMatch && bestMatch.n >= 2) {
    insights.push(`Your highest interview rate is currently coming from jobs with ${bestMatch.label} match (${bestMatch.rate}%, ${bestMatch.interviews} of ${bestMatch.n}).`);
  }
  if (st.bestCat) insights.push(`${st.bestCat.label} roles convert best so far: ${st.bestCat.interviews} interviews from ${st.bestCat.n} applications.`);
  if (st.sent) insights.push(`${st.responseRate}% of applications got a response. Average match score of applications sent: ${st.avgMatch}.`);
  if (!insights.length) insights.push('Log a few applications to see insights.');

  const kpis = [
    ['Applications sent', st.sent], ['Interviews', st.interviews], ['Offers', st.offers], ['Rejections', st.rejections],
    ['Response rate', `${st.responseRate}%`], ['Interview rate', `${st.interviewRate}%`], ['Offer rate', `${st.offerRate}%`], ['Avg. match', st.avgMatch],
  ];

  const askAi = () => tasks.ai('Reading your application data…', ['Aggregating results', 'Looking for patterns'], 'insights');

  return (
    <Stack gap={16}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10 }}>
        {kpis.map(([label, value]) => (
          <div key={label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 12, color: '#5b6472' }}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 650, letterSpacing: '-.03em' }}>{value}</div>
          </div>
        ))}
      </div>

      {st.smallSample && (
        <Notice>
          {st.sent
            ? `Based on ${st.sent} application${st.sent === 1 ? '' : 's'}. Patterns at this size can change quickly and aren't statistically significant.`
            : 'No applications logged yet. Add them in the tracker and your results will appear here.'}
        </Notice>
      )}

      <AutoGrid min={340}>
        <Card pad={20} gap={12}>
          <MonoLabel>Pipeline</MonoLabel>
          {st.funnel.map((f) => (
            <div key={f.label} style={{ display: 'grid', gridTemplateColumns: '90px minmax(0,1fr) 32px', gap: 12, alignItems: 'center', fontSize: 13 }}>
              <span>{f.label}</span>
              <div style={{ height: 24, borderRadius: 6, background: '#f1f3f5' }}>
                <div style={{ height: 24, borderRadius: 6, background: 'var(--acc)', width: `${Math.round((100 * f.n) / maxFunnel)}%` }} />
              </div>
              <span className="mono" style={{ textAlign: 'right' }}>{f.n}</span>
            </div>
          ))}
        </Card>
        <RateCard title="Interview rate by resume version" rows={st.byVersion} color="#7048e8" />
        <RateCard title="Interview rate by match score" rows={st.byMatch} color="#12805c" />
        <RateCard title="Interview rate by job category" rows={st.byCat} color="#b7791f" />
      </AutoGrid>

      <Card pad={20} gap={10}>
        <Row justify="space-between" gap={10} wrap>
          <MonoLabel>Insights from your data</MonoLabel>
          <Button variant="outline" size="sm" onClick={askAi}>Ask AI for deeper insights</Button>
        </Row>
        {insights.map((x) => (
          <Row key={x} gap={10} align="flex-start" style={{ fontSize: 14, lineHeight: 1.5 }}>
            <span style={{ color: 'var(--acc)' }}>→</span><span>{x}</span>
          </Row>
        ))}
        {ws.insights?.length > 0 && (
          <Stack gap={6} style={{ borderTop: '1px solid #eef0f3', paddingTop: 10 }}>
            <div style={{ fontSize: 12, color: '#5531c4', fontWeight: 600 }}>AI insights</div>
            {ws.insights.map((x) => (
              <Row key={x} gap={10} align="flex-start" style={{ fontSize: 14, lineHeight: 1.5 }}>
                <span style={{ color: '#7048e8' }}>→</span><span>{x}</span>
              </Row>
            ))}
          </Stack>
        )}
      </Card>
    </Stack>
  );
}
