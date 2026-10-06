import { CAREER_LEVELS } from '@waypoint/shared';
import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Field, Input, Row, Select, Stack, TextArea } from '../components/ui.jsx';
import { activeJobOf } from '../lib/derive.js';
import { useResumeActions } from '../state/actions.js';
import { useTasks } from '../state/TaskContext.jsx';
import { useWorkspace } from '../state/WorkspaceContext.jsx';

const STEPS = [['profile', 'Profile'], ['resume', 'Resume'], ['job', 'Target job']];

/** The six resume-health tiles plus the red-flag count (shared with the analyzer's numbers). */
function healthTiles(analysis) {
  const sc = analysis.scores || {};
  const counts = { critical: 0, warning: 0, improvement: 0 };
  analysis.redFlags.forEach((f) => { counts[f.severity] += 1; });
  const tiles = [
    ['Resume score', sc.overall], ['ATS readiness', sc.ats], ['Skill strength', sc.skills],
    ['Content quality', sc.content], ['Achievement strength', sc.achievements], ['Project proof', sc.proof],
  ].map(([label, value]) => ({ label, value: value ?? '—', ink: '#0f1218' }));
  tiles.push({ label: 'Red flags', value: `${counts.critical}·${counts.warning}·${counts.improvement}`, ink: counts.critical ? '#a8322a' : '#0f1218' });
  return tiles;
}

export default function Onboarding() {
  const { step } = useParams();
  const navigate = useNavigate();
  const { ws, set } = useWorkspace();
  const { analyzeResume, runAts, loadResumeFile } = useResumeActions();
  const tasks = useTasks();
  const [draft, setDraft] = useState({ title: '', company: '', text: '' }); // the first job, before one exists

  const current = STEPS.findIndex(([key]) => key === step) + 1; // 1-based like the design
  if (!current) return <Navigate to="/app/onboarding/profile" replace />;

  const { profile, resumeText, analysis } = ws;
  const job = activeJobOf(ws);
  const goStep = (n) => navigate(`/app/onboarding/${STEPS[n - 1][0]}`);
  const setProfile = (key) => (e) => set({ profile: { ...profile, [key]: e.target.value } });
  const setJob = (key) => (e) => set({ jobs: ws.jobs.map((j) => (j.id === job.id ? { ...j, [key]: e.target.value } : j)) });
  const setDraftField = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }));
  const createJobAndAnalyze = async () => {
    if (!draft.title.trim() || draft.text.trim().length < 100) return tasks.fail('Add a title and the full job description (at least a few lines).');
    const id = `j${Date.now()}`;
    set({ jobs: [...ws.jobs, { id, title: draft.title.trim(), company: draft.company.trim() || 'Unknown company', location: '', category: 'Other', text: draft.text }], activeJobId: id });
    if (await runAts(id)) navigate('/app/dashboard');
    return undefined;
  };
  const words = resumeText.trim() ? resumeText.trim().split(/\s+/).length : 0;

  return (
    <Stack gap={18} style={{ maxWidth: 920 }}>
      <nav aria-label="Onboarding steps" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 5, alignSelf: 'flex-start' }}>
        {STEPS.map(([key, label], i) => {
          const n = i + 1;
          const active = n === current;
          const done = n < current;
          return (
            <button
              key={key}
              onClick={() => goStep(n)}
              aria-current={active ? 'step' : undefined}
              style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px 6px 6px', borderRadius: 8, background: active ? '#f1f3f5' : 'transparent' }}
            >
              <span style={{ width: 22, height: 22, borderRadius: 6, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 600, background: active || done ? 'var(--acc)' : '#e9ebef', color: active || done ? '#fff' : '#3c4452' }}>
                {done ? '✓' : n}
              </span>
              <span style={{ fontSize: 13.5, fontWeight: 500 }}>{label}</span>
            </button>
          );
        })}
      </nav>

      {current === 1 && (
        <Card pad={26} gap={18} style={{ borderRadius: 14 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 17 }}>Your profile</div>
            <div style={{ fontSize: 13.5, color: '#5b6472' }}>Used as context for every analysis. Only what a task needs is sent to the model.</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14 }}>
            <Field label="Name"><Input value={profile.name} onChange={setProfile('name')} /></Field>
            <Field label="Target role"><Input value={profile.role} onChange={setProfile('role')} /></Field>
            <Field label="Career level">
              <Select value={profile.level} onChange={setProfile('level')}>
                {CAREER_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Years of experience"><Input value={profile.years} onChange={setProfile('years')} /></Field>
            <Field label="Location"><Input value={profile.location} onChange={setProfile('location')} /></Field>
            <Field label="Key skills"><Input value={profile.skills} onChange={setProfile('skills')} /></Field>
          </div>
          <Field label="Career goals">
            <TextArea style={{ minHeight: 80 }} value={profile.goals} onChange={setProfile('goals')} />
          </Field>
          <div><Button size="md" onClick={() => goStep(2)}>Continue to resume</Button></div>
        </Card>
      )}

      {current === 2 && (
        <>
          <Card pad={26} gap={14} style={{ borderRadius: 14 }}>
            <Row justify="space-between" align="flex-end" gap={16} wrap>
              <div>
                <div style={{ fontWeight: 600, fontSize: 17 }}>Master resume</div>
                <div style={{ fontSize: 13.5, color: '#5b6472' }}>Paste your resume text, or upload a PDF, DOCX or TXT file.</div>
              </div>
              <label className="btn btn--outline" style={{ cursor: 'pointer' }}>
                Upload file
                <input
                  type="file"
                  accept=".txt,.md,.pdf,.docx"
                  style={{ display: 'none' }}
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; loadResumeFile(f); }}
                />
              </label>
            </Row>
            <TextArea doc mono style={{ minHeight: 340 }} aria-label="Resume text" value={resumeText} onChange={(e) => set({ resumeText: e.target.value })} />
            <Row gap={12} wrap>
              <Button size="md" onClick={analyzeResume}>Analyze resume</Button>
              <span style={{ fontSize: 13, color: '#5b6472' }}>
                {words} words{analysis ? ' · analyzed' : ''}
              </span>
            </Row>
          </Card>

          {analysis && (
            <Card pad={22} gap={14} style={{ borderRadius: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 16 }}>Resume health</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10 }}>
                {healthTiles(analysis).map((h) => (
                  <div key={h.label} className="tile" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 12, color: '#5b6472' }}>{h.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 620, letterSpacing: '-.02em', color: h.ink }}>{h.value}</div>
                  </div>
                ))}
              </div>
              <Row gap={8} wrap>
                <Button onClick={() => goStep(3)}>Add a target job</Button>
                <Button variant="outline" onClick={() => navigate('/app/resume/health')}>Open full analysis</Button>
              </Row>
            </Card>
          )}
        </>
      )}

      {current === 3 && !job && (
        <Card pad={26} gap={14} style={{ borderRadius: 14 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 17 }}>Your first target job</div>
            <div style={{ fontSize: 13.5, color: '#5b6472' }}>Paste the job description of a role you're considering. You can add more later under Saved Jobs &amp; Priority.</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
            <Field label="Job title"><Input value={draft.title} onChange={setDraftField('title')} placeholder="e.g. Backend Developer" /></Field>
            <Field label="Company"><Input value={draft.company} onChange={setDraftField('company')} placeholder="e.g. Acme" /></Field>
          </div>
          <TextArea doc style={{ minHeight: 280, fontSize: 13.5, lineHeight: 1.6 }} aria-label="Job description" placeholder="Paste the full job description here" value={draft.text} onChange={setDraftField('text')} />
          <Row gap={8} wrap>
            <Button size="md" onClick={createJobAndAnalyze}>Save job &amp; analyze</Button>
            <Button size="md" variant="outline" onClick={() => navigate('/app/dashboard')}>Skip for now</Button>
          </Row>
        </Card>
      )}

      {current === 3 && job && (
        <Card pad={26} gap={14} style={{ borderRadius: 14 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 17 }}>Target job</div>
            <div style={{ fontSize: 13.5, color: '#5b6472' }}>Editing the active job. Add more under Saved Jobs &amp; Priority.</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
            <Field label="Job title"><Input value={job.title} onChange={setJob('title')} /></Field>
            <Field label="Company"><Input value={job.company} onChange={setJob('company')} /></Field>
          </div>
          <TextArea doc style={{ minHeight: 280, fontSize: 13.5, lineHeight: 1.6 }} aria-label="Job description" value={job.text} onChange={setJob('text')} />
          <Row gap={8} wrap>
            <Button size="md" onClick={async () => { if (await runAts(job.id)) navigate('/app/dashboard'); }}>Analyze against this job</Button>
            <Button size="md" variant="outline" onClick={() => navigate('/app/dashboard')}>Go to dashboard</Button>
          </Row>
        </Card>
      )}
    </Stack>
  );
}
