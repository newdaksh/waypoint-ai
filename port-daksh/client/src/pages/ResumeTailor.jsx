import { activeResumeOf } from '@waypoint/shared';
import { useState } from 'react';
import NoJob from '../components/NoJob.jsx';
import ResumeEditor from '../components/ResumeEditor.jsx';
import { Button, Card, EmptyCard, Field, Input, MonoLabel, Row, Segmented, Split, Stack } from '../components/ui.jsx';
import { activeJobOf, jobLabelOf, statsOf, today } from '../lib/derive.js';
import { useTasks } from '../state/TaskContext.jsx';
import { useWorkspace } from '../state/WorkspaceContext.jsx';

function download(text, company) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `resume-${company.toLowerCase().replace(/\W+/g, '-')}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ResumeTailorBody() {
  const { ws, set, merge } = useWorkspace();
  const tasks = useTasks();
  const job = activeJobOf(ws);
  const resume = activeResumeOf(ws);
  const label = jobLabelOf(job);
  const tb = ws.tailorBy[job.id];
  const defaultName = `v${ws.resumes.length} · ${job.company}`;

  const [view, setView] = useState('tailored'); // which resume the editor shows
  const [versionName, setVersionName] = useState('');
  const [saved, setSaved] = useState(null); // { jobId, text }: the message belongs to the job it was saved for
  const savedMsg = saved?.jobId === job.id ? saved.text : '';

  const stats = statsOf(ws);
  const resumeList = ws.resumes.map((v) => {
    const g = stats.byVersion.find((x) => x.label === v.id);
    return { id: v.id, name: v.name, usage: g ? `${g.n} apps · ${g.interviews} int.` : 'unused' };
  });

  const runTailor = () =>
    tasks.ai('Tailoring your resume…', ['Reading the job', 'Ranking your relevant experience', 'Rewriting for clarity', 'Checking nothing was invented'], 'tailor', { jobId: job.id });

  const saveVersion = () => {
    const name = versionName || defaultName;
    set({ resumes: [...ws.resumes, { id: `v${Date.now()}`, name, note: `Tailored for ${label}`, created: today(), text: tb.text }] });
    setSaved({ jobId: job.id, text: `Saved as "${name}". It's now under Resumes, and you can pick it when you log an application.` });
    setVersionName('');
  };

  return (
    <Stack gap={16}>
      <Row gap={10} wrap style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 14px' }}>
        <span style={{ fontSize: 13, color: '#5b6472', flex: 1, minWidth: 240 }}>
          Reorders and rewrites only what's in {resume.name}. Nothing is added that you didn't provide.
        </span>
        <Button onClick={runTailor}>Tailor for this job</Button>
      </Row>

      {!tb && <EmptyCard>No tailored version for {label} yet. Run tailoring to generate one.</EmptyCard>}

      {tb && (
        <>
          <Row>
            <Segmented
              label="Which resume to show"
              value={view}
              onChange={setView}
              items={[{ key: 'tailored', label: 'Tailored version' }, { key: 'original', label: `Original · ${resume.name}` }]}
            />
          </Row>
          {view === 'tailored' ? (
            <ResumeEditor
              key={`tailored:${job.id}`}
              title={`Tailored for ${label}`}
              text={tb.text}
              onChange={(text) => merge('tailorBy', { [job.id]: { ...tb, text } })}
            />
          ) : (
            <ResumeEditor
              key={`original:${resume.id}`}
              title={resume.name}
              text={resume.text}
              onChange={(text) => set({ resumes: ws.resumes.map((r) => (r.id === resume.id ? { ...r, text } : r)) })}
            />
          )}

          <Split cols="minmax(0,1.4fr) minmax(0,1fr)">
            <Card pad={20} gap={4}>
              <MonoLabel style={{ marginBottom: 8 }}>What changed</MonoLabel>
              {tb.changes.map((ch, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '96px minmax(0,1fr)', gap: 12, padding: '10px 0', borderBottom: '1px solid #f1f2f5', fontSize: 13.5, lineHeight: 1.5 }}>
                  <span style={{ fontWeight: 600, color: 'var(--acc-i)' }}>{ch.section}</span>
                  <div>
                    {ch.change}
                    <div style={{ color: '#5b6472', fontSize: 12.5 }}>{ch.reason}</div>
                  </div>
                </div>
              ))}
              <div style={{ fontSize: 12.5, color: '#5b6472', marginTop: 10 }}>
                Not added because your resume has no evidence:{' '}
                <b style={{ fontWeight: 600, color: '#a8322a' }}>{tb.notIncluded.length ? tb.notIncluded.join(', ') : 'none'}</b>
              </div>
            </Card>

            <Card pad={20} gap={12}>
              <MonoLabel>Save &amp; export</MonoLabel>
              <Field label="Version name">
                <Input maxLength={200} value={versionName || defaultName} onChange={(e) => setVersionName(e.target.value)} />
              </Field>
              <Row gap={8} wrap>
                <Button onClick={saveVersion}>Save as new resume</Button>
                <Button variant="outline" onClick={() => download(tb.text, job.company)}>Download .txt</Button>
              </Row>
              {savedMsg && <div role="status" style={{ fontSize: 12.5, color: '#0b6247' }}>{savedMsg}</div>}
              <div style={{ fontSize: 12, fontWeight: 600, color: '#3c4452', marginTop: 6 }}>Your resumes</div>
              {resumeList.map((v) => (
                <Row key={v.id} justify="space-between" gap={10} style={{ fontSize: 13, padding: '6px 0', borderBottom: '1px solid #f1f2f5' }}>
                  <span style={{ fontWeight: 500 }}>{v.name}</span>
                  <span className="mono" style={{ color: '#8b93a1', fontSize: 12 }}>{v.usage}</span>
                </Row>
              ))}
            </Card>
          </Split>
        </>
      )}
    </Stack>
  );
}

export default function ResumeTailor() {
  const { ws } = useWorkspace();
  return activeJobOf(ws) ? <ResumeTailorBody /> : <NoJob tool="The resume tailor" />;
}
