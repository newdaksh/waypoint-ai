import { useNavigate } from 'react-router-dom';
import { AutoGrid, Bullet, Button, Card, LinkButton, MonoLabel, Pill, Row, Split, Stack, Tags } from '../components/ui.jsx';
import { activeJobOf, atsOf, jobLabelOf, readinessOf, roadmapPercent, versionShort } from '../lib/derive.js';
import { impactTone, pill, statusTone } from '../lib/theme.js';
import { useWorkspace } from '../state/WorkspaceContext.jsx';

// Where each recommended action's module lives.
const MODULE_ROUTES = {
  'Bullet Optimizer': '/app/bullets',
  'Skill-Proof': '/app/proof',
  'Interview Predictor': '/app/interview/practice',
  'Learning Roadmap': '/app/roadmap',
  'Resume Tailor': '/app/tailor',
  'Resume Analyzer': '/app/resume/health',
  'Skill Gap': '/app/gap',
};

/** Where a new account starts: the three things every tool needs, with a button for the next one. */
function GetStarted({ steps }) {
  const navigate = useNavigate();
  const next = steps.find((s) => !s.done);
  const doneCount = steps.filter((s) => s.done).length;
  return (
    <Card accent pad={24} gap={18} style={{ background: 'linear-gradient(135deg, var(--acc-t), #fff 60%)' }}>
      <Row justify="space-between" gap={12} wrap>
        <Stack gap={4}>
          <div style={{ fontSize: 20, fontWeight: 620, letterSpacing: '-.02em' }}>Get started</div>
          <div style={{ fontSize: 14, color: '#5b6472' }}>Three quick steps unlock every tool. {doneCount} of {steps.length} done.</div>
        </Stack>
        {next && <Button onClick={() => navigate(next.to)}>{next.cta}</Button>}
      </Row>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
        {steps.map((s, i) => (
          <button
            key={s.to}
            onClick={() => navigate(s.to)}
            style={{ all: 'unset', cursor: 'pointer', boxSizing: 'border-box', display: 'flex', gap: 12, padding: 14, borderRadius: 12, background: '#fff', border: '1px solid var(--line)' }}
          >
            <span style={{ width: 26, height: 26, borderRadius: 8, flex: 'none', display: 'grid', placeItems: 'center', fontWeight: 650, fontSize: 13, background: s.done ? '#12805c' : 'var(--acc-t)', color: s.done ? '#fff' : 'var(--acc-i)' }}>
              {s.done ? '✓' : i + 1}
            </span>
            <span>
              <span style={{ display: 'block', fontWeight: 600, fontSize: 14, color: s.done ? '#5b6472' : 'var(--ink)', textDecoration: s.done ? 'line-through' : 'none' }}>{s.label}</span>
              <span style={{ display: 'block', fontSize: 12.5, color: '#8b93a1', marginTop: 2 }}>{s.desc}</span>
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}

const th = { padding: '8px 10px', fontWeight: 500, borderBottom: '1px solid #eceef2' };
const td = { padding: 10, borderBottom: '1px solid #f1f2f5' };

export default function Dashboard() {
  const navigate = useNavigate();
  const { ws } = useWorkspace();
  const a = ws.analysis;
  const job = activeJobOf(ws);
  const ats = atsOf(ws);
  const { readiness, readinessDeg, components, formulaText } = readinessOf(ws);
  const pct = roadmapPercent(ws);
  const steps = [
    { label: 'Set up your profile', desc: 'Target role, experience and goals.', done: Boolean(ws.profile.role.trim()), to: '/app/profile', cta: 'Set up profile' },
    { label: 'Add and analyze your resume', desc: 'A health check, red flags and ATS readiness.', done: Boolean(a), to: '/app/resumes', cta: 'Add your resume' },
    { label: 'Add a target job', desc: 'Decode it, see the gaps and get a priority.', done: ws.jobs.length > 0, to: '/app/targets', cta: 'Add a target job' },
  ];

  const actions = a?.actions || [];
  const flags = a?.redFlags || [];
  const matched = ats?.matched || [];
  const missing = ats?.missing || [];
  const levels = a?.skillLevels || [];
  const bucket = (level) => levels.filter((k) => k.level === level).map((k) => k.skill);
  const skillBuckets = [
    ['Strong', bucket('strong'), '#12805c'],
    ['Intermediate', bucket('intermediate'), 'var(--acc)'],
    ['Weak', bucket('weak'), '#d99a2b'],
    ['Missing (from JD)', missing, '#d1453b'],
  ].map(([label, list, color]) => ({ label, count: list.length, list: list.length ? list.join(', ') : 'None', color }));

  const blockers = flags
    .filter((f) => f.severity === 'critical')
    .map((f) => f.title)
    .concat(missing.length ? [`Missing from resume: ${missing.slice(0, 3).join(', ')}`] : [])
    .slice(0, 4);

  const lastDate = (app) => app.events[app.events.length - 1]?.date || '';
  const recent = [...ws.apps].sort((x, y) => lastDate(y).localeCompare(lastDate(x))).slice(0, 5);

  return (
    <Stack gap={16}>
      {steps.some((s) => !s.done) && <GetStarted steps={steps} />}
      <Split cols="minmax(0,1.15fr) minmax(0,1fr)">
        <Card pad={24} gap={20}>
          <Row justify="space-between" gap={12} wrap align="flex-start">
            <MonoLabel>Career readiness</MonoLabel>
            <span style={{ fontSize: 12, color: '#8b93a1' }}>An estimate, not a measure of employability</span>
          </Row>
          <Row gap={26} wrap>
            <div
              role="img"
              aria-label={readiness == null ? 'Career readiness not measured yet' : `Career readiness ${readiness} out of 100`}
              style={{ width: 144, height: 144, borderRadius: '50%', background: `conic-gradient(var(--acc) ${readinessDeg}deg, #eceef2 0deg)`, display: 'grid', placeItems: 'center', flex: 'none' }}
            >
              <div style={{ width: 116, height: 116, borderRadius: '50%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 44, fontWeight: 650, letterSpacing: '-.04em', lineHeight: 1, color: readiness == null ? '#c4c9d2' : undefined }}>{readiness ?? '—'}</span>
                {readiness != null && <span style={{ fontSize: 12, color: '#8b93a1' }}>of 100</span>}
              </div>
            </div>
            <Stack gap={8} style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-.02em' }}>{ws.profile.role || 'Your target role'}</div>
              <p style={{ fontSize: 13.5, lineHeight: 1.55, color: '#5b6472', margin: 0, textWrap: 'pretty' }}>{formulaText}</p>
            </Stack>
          </Row>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
            {components.map((c) => (
              <Stack key={c.label} gap={7} className="tile">
                <Row justify="space-between" style={{ fontSize: 12, color: '#5b6472' }}>
                  <span>{c.label}</span>
                  <span className="mono" style={{ fontSize: 11 }}>{c.weightText}</span>
                </Row>
                <div style={{ fontSize: 22, fontWeight: 620, letterSpacing: '-.02em', lineHeight: 1 }}>{c.valueText}</div>
                <div style={{ height: 5, borderRadius: 9, background: '#e6e8ec' }}>
                  <div style={{ height: 5, borderRadius: 9, background: 'var(--acc)', width: `${c.bar}%` }} />
                </div>
                <div style={{ fontSize: 11.5, color: '#8b93a1' }}>{c.note}</div>
              </Stack>
            ))}
          </div>
        </Card>

        <Card pad={24} gap={12}>
          <MonoLabel>Recommended actions</MonoLabel>
          {actions.map((ac, i) => (
            <div key={ac.title} style={{ border: '1px solid #eceef2', borderRadius: 12, padding: 14, display: 'flex', gap: 12 }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--acc-t)', color: 'var(--acc-i)', display: 'grid', placeItems: 'center', fontWeight: 650, fontSize: 13, flex: 'none' }}>{i + 1}</div>
              <Stack gap={5} style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14.5 }}>{ac.title}</div>
                <div style={{ fontSize: 13, color: '#4a5260', lineHeight: 1.5 }}>{ac.why} {ac.action}</div>
                <Row gap={6} wrap style={{ marginTop: 2 }}>
                  <Pill small tone={impactTone(ac.impact)}>{ac.impact} impact</Pill>
                  <LinkButton onClick={() => navigate(MODULE_ROUTES[ac.module] || '/app/resume/health')} style={{ fontSize: 12.5 }}>
                    Open {ac.module} →
                  </LinkButton>
                </Row>
              </Stack>
            </div>
          ))}
          {!actions.length && <div style={{ fontSize: 14, color: '#5b6472' }}>Analyze a resume to get recommendations.</div>}
        </Card>
      </Split>

      <AutoGrid min={300}>
        <Card pad={22} gap={12}>
          <MonoLabel>Target career</MonoLabel>
          <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-.02em' }}>{ws.profile.role || 'Not set yet'}</div>
          <div style={{ fontSize: 13, color: '#5b6472' }}>
            {ats ? `Compared against ${jobLabelOf(job)}` : `No ATS analysis for ${jobLabelOf(job)} yet`}
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#3c4452' }}>Required skills you show</div>
          <Tags items={matched} tone={pill.green} />
          <div style={{ fontSize: 12, fontWeight: 600, color: '#3c4452' }}>Missing from your resume</div>
          <Tags items={missing} tone={pill.red} />
          <LinkButton onClick={() => navigate('/app/roadmap')} style={{ marginTop: 4 }}>Learning path · {pct}% complete →</LinkButton>
        </Card>

        <Card pad={22} gap={12}>
          <MonoLabel>Skill progress</MonoLabel>
          <div style={{ display: 'flex', height: 10, borderRadius: 9, overflow: 'hidden', gap: 2 }}>
            {skillBuckets.map((b) => <div key={b.label} style={{ flex: b.count, background: b.color }} />)}
          </div>
          {skillBuckets.map((b) => (
            <Row key={b.label} gap={10} align="flex-start">
              <span style={{ width: 10, height: 10, borderRadius: 3, background: b.color, marginTop: 4, flex: 'none' }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{b.label} · {b.count}</div>
                <div style={{ fontSize: 12.5, color: '#5b6472', lineHeight: 1.5 }}>{b.list}</div>
              </div>
            </Row>
          ))}
        </Card>

        <Card pad={22} gap={10}>
          <MonoLabel>Strengths &amp; blockers</MonoLabel>
          {(a?.strengths || []).map((x) => <Bullet key={x} glyph="+" color="#12805c">{x}</Bullet>)}
          <div style={{ height: 1, background: '#eef0f3', margin: '4px 0' }} />
          {blockers.map((x) => <Bullet key={x} glyph="!" color="#d1453b">{x}</Bullet>)}
        </Card>
      </AutoGrid>

      <Card pad={22} gap={12}>
        <Row justify="space-between">
          <MonoLabel>Recent applications</MonoLabel>
          <LinkButton onClick={() => navigate('/app/tracker')}>View all →</LinkButton>
        </Row>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr style={{ textAlign: 'left', color: '#6b7280', fontSize: 12 }}>
                <th style={th}>Company</th>
                <th style={th}>Role</th>
                <th style={{ ...th, textAlign: 'right' }}>Match</th>
                <th style={th}>Resume</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {!recent.length && (
                <tr>
                  <td colSpan={5} style={{ ...td, color: '#8b93a1', padding: '18px 10px' }}>No applications yet. Log one in the tracker to see it here.</td>
                </tr>
              )}
              {recent.map((r) => {
                const tone = statusTone[r.status] || pill.gray;
                return (
                  <tr key={r.id}>
                    <td style={{ ...td, fontWeight: 500 }}>{r.company}</td>
                    <td style={{ ...td, color: '#3c4452' }}>{r.role}</td>
                    <td style={{ ...td, textAlign: 'right' }} className="mono">{r.match}%</td>
                    <td style={{ ...td, color: '#5b6472' }}>{versionShort(ws, r.version)}</td>
                    <td style={td}><Pill tone={tone}>{r.status}</Pill></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </Stack>
  );
}
