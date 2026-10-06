import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Bar, Bullet, Button, Card, AutoGrid, EmptyCard, MonoLabel, Notice, Row, Segmented, Spacer, Split, Stack, Tags } from '../components/ui.jsx';
import NoJob from '../components/NoJob.jsx';
import { activeJobOf, atsOf, jobLabelOf } from '../lib/derive.js';
import { pill, scoreColor } from '../lib/theme.js';
import { RESUME_TABS } from '../lib/nav.js';
import { useResumeActions } from '../state/actions.js';
import { useWorkspace } from '../state/WorkspaceContext.jsx';

const FLAG_GROUPS = [
  ['critical', 'Critical', '#d1453b'],
  ['warning', 'Warning', '#d99a2b'],
  ['improvement', 'Improvement', '#12805c'],
];
const CHECK_TONE = { pass: [pill.green, 'Pass'], risk: [pill.amber, 'Risk'], fail: [pill.red, 'Fail'] };

function HealthTab({ analysis, flagCounts }) {
  const sc = analysis.scores || {};
  const bars = [
    ['Resume score', sc.overall], ['ATS readiness', sc.ats], ['Skill strength', sc.skills],
    ['Content quality', sc.content], ['Achievement strength', sc.achievements], ['Project proof', sc.proof],
  ];
  return (
    <Split cols="minmax(0,1fr) minmax(0,1.3fr)">
      <Card pad={24} gap={14}>
        <MonoLabel>Resume score</MonoLabel>
        <Row gap={8} align="baseline">
          <span style={{ fontSize: 64, fontWeight: 650, letterSpacing: '-.05em', lineHeight: 1 }}>{sc.overall}</span>
          <span style={{ color: '#8b93a1', fontSize: 14 }}>/ 100 · estimate</span>
        </Row>
        <p style={{ fontSize: 14.5, lineHeight: 1.6, margin: 0, color: '#3c4452', textWrap: 'pretty' }}>{analysis.summary}</p>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#3c4452', marginTop: 4 }}>What's working</div>
        {analysis.strengths.map((x) => <Bullet key={x} glyph="+" color="#12805c" gap={9} style={{ lineHeight: 'normal' }}>{x}</Bullet>)}
      </Card>
      <Card pad={24} gap={16}>
        <MonoLabel>Breakdown</MonoLabel>
        {bars.map(([label, v]) => (
          <div key={label} style={{ display: 'grid', gridTemplateColumns: '150px minmax(0,1fr) 36px', gap: 14, alignItems: 'center' }}>
            <span style={{ fontSize: 13.5, color: '#3c4452' }}>{label}</span>
            <Bar value={v || 0} color={scoreColor(v)} height={8} />
            <span className="mono" style={{ fontSize: 15, fontWeight: 600, textAlign: 'right' }}>{v ?? '—'}</span>
          </div>
        ))}
        <div style={{ fontSize: 12.5, color: '#5b6472', borderTop: '1px solid #eef0f3', paddingTop: 12 }}>
          Red flags: {flagCounts.critical} critical, {flagCounts.warning} warnings, {flagCounts.improvement} improvements
        </div>
      </Card>
    </Split>
  );
}

function FlagsTab({ flags }) {
  const groups = FLAG_GROUPS.map(([key, label, dot]) => ({ label, dot, items: flags.filter((f) => f.severity === key) })).filter((g) => g.items.length);
  return (
    <Stack gap={20}>
      {groups.map((g) => (
        <Stack key={g.label} gap={10}>
          <Row gap={8}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: g.dot }} />
            <span style={{ fontWeight: 600, fontSize: 15 }}>{g.label}</span>
            <span style={{ fontSize: 12, color: '#8b93a1' }}>{g.items.length}</span>
          </Row>
          {g.items.map((f) => (
            <Card key={f.title} pad="18px 20px" gap={12} style={{ borderRadius: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{f.title}</div>
              <div className="mono" style={{ fontSize: 12.5, background: '#f7f8fa', borderLeft: `3px solid ${g.dot}`, borderRadius: 6, padding: '8px 12px', color: '#3c4452' }}>{f.quote}</div>
              <AutoGrid min={200} style={{ fontSize: 13.5, lineHeight: 1.5 }}>
                <div><div style={{ fontSize: 11.5, color: '#8b93a1', marginBottom: 3 }}>Problem</div>{f.problem}</div>
                <div><div style={{ fontSize: 11.5, color: '#8b93a1', marginBottom: 3 }}>Why it matters</div>{f.why}</div>
                <div><div style={{ fontSize: 11.5, color: '#12805c', marginBottom: 3 }}>How to fix</div>{f.fix}</div>
              </AutoGrid>
            </Card>
          ))}
        </Stack>
      ))}
    </Stack>
  );
}

function AtsTab({ ws, runAts }) {
  if (!activeJobOf(ws)) return <NoJob tool="The ATS analyzer" />;
  const t = atsOf(ws);
  const label = jobLabelOf(activeJobOf(ws));
  return (
    <Stack gap={16}>
      <Notice>AI approximation of common ATS checks. It doesn't reproduce any specific employer's system and isn't a guarantee of passing one.</Notice>
      {t && (
        <>
          <Split cols="minmax(0,1fr) minmax(0,1.3fr)">
            <Card pad={24} gap={14}>
              <MonoLabel>ATS readiness</MonoLabel>
              <Row gap={8} align="baseline">
                <span style={{ fontSize: 64, fontWeight: 650, letterSpacing: '-.05em', lineHeight: 1 }}>{t.score}</span>
                <span style={{ color: '#8b93a1', fontSize: 14 }}>/ 100</span>
              </Row>
              <div style={{ fontSize: 13, color: '#5b6472' }}>Compared against {label}</div>
              <p style={{ fontSize: 14, lineHeight: 1.55, margin: 0, color: '#3c4452' }}>{t.summary}</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="tile"><div style={{ fontSize: 12, color: '#5b6472' }}>Keyword coverage</div><div style={{ fontSize: 22, fontWeight: 620 }}>{t.keywordCoverage}%</div></div>
                <div className="tile"><div style={{ fontSize: 12, color: '#5b6472' }}>Job fit</div><div style={{ fontSize: 22, fontWeight: 620 }}>{t.jobFit}</div></div>
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.5 }}><b style={{ fontWeight: 600 }}>Title alignment.</b> {t.titleAlignment}</div>
            </Card>
            <Card pad={24} gap={4}>
              <MonoLabel style={{ marginBottom: 8 }}>Checks</MonoLabel>
              {t.checks.map((ck) => {
                const [tone, text] = CHECK_TONE[ck.status];
                return (
                  <div key={ck.label} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid #f1f2f5' }}>
                    <span style={{ flex: 'none', width: 44, textAlign: 'center', fontSize: 11.5, fontWeight: 600, padding: '2px 0', borderRadius: 99, background: tone[0], color: tone[1] }}>{text}</span>
                    <div style={{ fontSize: 13.5, lineHeight: 1.45 }}>
                      <div style={{ fontWeight: 600 }}>{ck.label}</div>
                      <div style={{ color: '#5b6472' }}>{ck.note}</div>
                    </div>
                  </div>
                );
              })}
            </Card>
          </Split>
          <AutoGrid min={280}>
            <Card pad={20} gap={10}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#0b6247' }}>Keywords found</span>
              <Tags items={t.matched} tone={pill.green} />
            </Card>
            <Card pad={20} gap={10}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#a8322a' }}>Keywords missing</span>
              <Tags items={t.missing} tone={pill.red} />
              <div style={{ fontSize: 12, color: '#8b93a1' }}>Only add these if they reflect work you've actually done.</div>
            </Card>
          </AutoGrid>
        </>
      )}
      <div><Button onClick={() => runAts()}>Run ATS analysis for this job</Button></div>
    </Stack>
  );
}

export default function ResumeAnalyzer() {
  const { tab } = useParams();
  const navigate = useNavigate();
  const { ws } = useWorkspace();
  const { analyzeResume, runAts } = useResumeActions();

  if (!RESUME_TABS.includes(tab)) return <Navigate to="/app/resume/health" replace />;

  const analysis = ws.analysis;
  const hasResume = ws.resumeText.trim().length > 0;
  const flags = analysis?.redFlags || [];
  const flagCounts = { critical: 0, warning: 0, improvement: 0 };
  flags.forEach((f) => { flagCounts[f.severity] += 1; });

  const tabs = [
    { key: 'health', label: 'Resume health' },
    { key: 'flags', label: `Red flags · ${flags.length}` },
    { key: 'ats', label: 'ATS analyzer' },
  ];

  return (
    <Stack gap={16}>
      <Row gap={10} wrap>
        <Segmented items={tabs} value={tab} onChange={(k) => navigate(`/app/resume/${k}`)} label="Resume analysis views" />
        <Spacer />
        <Button variant="outline" onClick={() => navigate('/app/onboarding/resume')}>Edit resume text</Button>
        <Button onClick={analyzeResume}>{analysis ? 'Re-analyze' : 'Analyze resume'}</Button>
      </Row>

      {tab !== 'ats' && !analysis && (
        <EmptyCard>
          <Stack gap={12} align="flex-start">
            <span>{hasResume ? 'No analysis yet. Choose “Analyze resume” to run one.' : 'No analysis yet. Add your resume first, then analyze it.'}</span>
            {!hasResume && <Button onClick={() => navigate('/app/onboarding/resume')}>Add your resume</Button>}
          </Stack>
        </EmptyCard>
      )}
      {tab === 'health' && analysis && <HealthTab analysis={analysis} flagCounts={flagCounts} />}
      {tab === 'flags' && analysis && <FlagsTab flags={flags} />}
      {tab === 'ats' && <AtsTab ws={ws} runAts={runAts} />}
    </Stack>
  );
}
