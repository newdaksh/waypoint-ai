import { activeResumeOf, removeResumePatch } from '@waypoint/shared';
import { useNavigate } from 'react-router-dom';
import ResumeEditor from '../components/ResumeEditor.jsx';
import { AutoGrid, Button, Card, Field, Input, Pill, Row, Spacer, Stack } from '../components/ui.jsx';
import { today } from '../lib/derive.js';
import { wordCount } from '../lib/resumeDoc.js';
import { pill } from '../lib/theme.js';
import { useResumeActions } from '../state/actions.js';
import { useWorkspace } from '../state/WorkspaceContext.jsx';

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

const sub = { fontSize: 12.5, color: '#5b6472' };

export default function Resumes() {
  const navigate = useNavigate();
  const { ws, set, save } = useWorkspace();
  const { analyzeResume, readResumeFile } = useResumeActions();
  const resume = activeResumeOf(ws);
  const { analysis } = ws; // the selected resume's

  const update = (changes) => set({ resumes: ws.resumes.map((r) => (r.id === resume.id ? { ...r, ...changes } : r)) });
  const add = (name, text = '') => {
    const id = `r${Date.now()}`;
    set({ resumes: [...ws.resumes, { id, name, note: '', created: today(), text }], activeResumeId: id });
  };
  const upload = async (file) => {
    const text = await readResumeFile(file);
    if (text == null) return;
    // An empty resume is waiting to be filled; otherwise the file becomes a resume of its own.
    if (!resume.text.trim()) update({ text });
    else add(file.name.replace(/\.[^.]+$/, '').slice(0, 120) || 'Uploaded resume', text);
  };
  const remove = () => {
    if (!window.confirm(`Delete "${resume.name}" and what was analyzed for it? This can't be undone.`)) return;
    save(removeResumePatch(ws, resume.id));
  };

  return (
    <Stack gap={16}>
      <Row gap={10} wrap>
        <span style={{ fontSize: 13, color: '#5b6472', flex: 1, minWidth: 260 }}>
          Keep one resume per kind of role, plus the tailored versions you save. Select one to work with it: every tool then reads that resume.
        </span>
        <label className="btn btn--outline" style={{ cursor: 'pointer' }}>
          Upload file
          <input
            type="file"
            accept=".txt,.md,.pdf,.docx"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; upload(f); }}
          />
        </label>
        <Button onClick={() => add(`Resume ${ws.resumes.length + 1}`)}>New resume</Button>
      </Row>

      <AutoGrid min={230} gap={10}>
        {ws.resumes.map((r) => {
          const score = ws.analysisBy[r.id]?.scores?.overall;
          return (
            <button key={r.id} type="button" className="pick" aria-pressed={r.id === resume.id} onClick={() => set({ activeResumeId: r.id })}>
              <Row justify="space-between" gap={8}>
                <span style={{ fontWeight: 600, fontSize: 14, minWidth: 0, overflowWrap: 'anywhere' }}>{r.name || 'Untitled resume'}</span>
                {r.id === resume.id && <Pill small tone={pill.blue}>In use</Pill>}
              </Row>
              {r.note && <span style={sub}>{r.note}</span>}
              <span className="mono" style={{ fontSize: 12, color: '#8b93a1' }}>
                {wordCount(r.text)} words · {score == null ? 'not analyzed' : `score ${score}`}
              </span>
            </button>
          );
        })}
      </AutoGrid>

      <Card pad={20} gap={14}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12 }}>
          <Field label="Resume name"><Input maxLength={200} value={resume.name} onChange={(e) => update({ name: e.target.value })} /></Field>
          <Field label="Note"><Input maxLength={300} placeholder="e.g. Backend roles" value={resume.note || ''} onChange={(e) => update({ note: e.target.value })} /></Field>
        </div>
        <Row gap={8} wrap>
          <Button size="md" onClick={analyzeResume}>{analysis ? 'Re-analyze resume' : 'Analyze resume'}</Button>
          {analysis && <Button size="md" variant="outline" onClick={() => navigate('/app/resume/health')}>Open full analysis</Button>}
          <Spacer />
          {ws.resumes.length > 1 && (
            <button className="ghostbtn" style={{ color: '#a8322a' }} onClick={remove}>Delete resume</button>
          )}
        </Row>
      </Card>

      <ResumeEditor key={resume.id} title={resume.name || 'Untitled resume'} text={resume.text} onChange={(text) => update({ text })} startEditing={!resume.text} />

      {analysis && (
        <Card pad={22} gap={14}>
          <div style={{ fontWeight: 600, fontSize: 16 }}>Resume health</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10 }}>
            {healthTiles(analysis).map((h) => (
              <div key={h.label} className="tile" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={sub}>{h.label}</div>
                <div style={{ fontSize: 22, fontWeight: 620, letterSpacing: '-.02em', color: h.ink }}>{h.value}</div>
              </div>
            ))}
          </div>
          {!ws.jobs.length && <div><Button onClick={() => navigate('/app/targets')}>Add a target job</Button></div>}
        </Card>
      )}
    </Stack>
  );
}
