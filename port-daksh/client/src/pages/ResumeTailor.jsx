import { useState } from 'react';
import { Button, Card, EmptyCard, Field, Input, MonoLabel, Row, Split, Stack, TextArea } from '../components/ui.jsx';
import { activeJobOf, jobLabelOf, statsOf, today } from '../lib/derive.js';
import { useTasks } from '../state/TaskContext.jsx';
import NoJob from '../components/NoJob.jsx';
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
  const label = jobLabelOf(job);
  const tb = ws.tailorBy[job.id];
  const defaultName = `v${ws.versions.length} · ${job.company}`;

  const [versionName, setVersionName] = useState('');
  const [saved, setSaved] = useState(null); // { jobId, text }: the message belongs to the job it was saved for
  const savedMsg = saved?.jobId === job.id ? saved.text : '';

  const stats = statsOf(ws);
  const versionsList = ws.versions.map((v) => {
    const g = stats.byVersion.find((x) => x.label === v.id);
    return { id: v.id, name: v.name, usage: g ? `${g.n} apps · ${g.interviews} int.` : 'unused' };
  });

  const runTailor = () =>
    tasks.ai('Tailoring your resume…', ['Reading the job', 'Ranking your relevant experience', 'Rewriting for clarity', 'Checking nothing was invented'], 'tailor', { jobId: job.id });

  const saveVersion = () => {
    const name = versionName || defaultName;
    set({ versions: [...ws.versions, { id: `v${Date.now()}`, name, note: `Tailored for ${label}`, created: today(), text: tb.text }] });
    setSaved({ jobId: job.id, text: `Saved as "${name}". Pick it when you log an application.` });
    setVersionName('');
  };

  return (
    <Stack gap={16}>
      <Row gap={10} wrap style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 14px' }}>
        <span style={{ fontSize: 13, color: '#5b6472', flex: 1, minWidth: 240 }}>
          Reorders and rewrites only what's in your master resume. Nothing is added that you didn't provide.
        </span>
        <Button onClick={runTailor}>Tailor for this job</Button>
      </Row>

      {!tb && <EmptyCard>No tailored version for {label} yet. Run tailoring to generate one.</EmptyCard>}

      {tb && (
        <>
          <Split cols="minmax(0,1fr) minmax(0,1fr)">
            <Card pad={18} gap={10}>
              <Row justify="space-between">
                <span style={{ fontWeight: 600, fontSize: 14 }}>Master resume</span>
                <span style={{ fontSize: 12, color: '#8b93a1' }}>Original</span>
              </Row>
              <TextArea
                readOnly
                aria-label="Master resume (original)"
                value={ws.resumeText}
                style={{ minHeight: 520, border: '1px solid #eceef2', borderRadius: 10, padding: 14, fontFamily: "'Geist Mono', monospace", fontSize: 12, lineHeight: 1.65, background: '#fafbfc', color: '#5b6472' }}
              />
            </Card>
            <Card pad={18} gap={10} style={{ borderColor: 'var(--acc-b)', boxShadow: '0 8px 24px rgba(59,91,219,.07)' }}>
              <Row justify="space-between">
                <span style={{ fontWeight: 600, fontSize: 14 }}>Tailored for {label}</span>
                <span style={{ fontSize: 12, color: 'var(--acc-i)' }}>Editable</span>
              </Row>
              <TextArea
                aria-label="Tailored resume"
                value={tb.text}
                onChange={(e) => merge('tailorBy', { [job.id]: { ...tb, text: e.target.value } })}
                style={{ minHeight: 520, border: '1px solid var(--acc-b)', borderRadius: 10, padding: 14, fontFamily: "'Geist Mono', monospace", fontSize: 12, lineHeight: 1.65 }}
              />
            </Card>
          </Split>

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
                <Input value={versionName || defaultName} onChange={(e) => setVersionName(e.target.value)} />
              </Field>
              <Row gap={8} wrap>
                <Button onClick={saveVersion}>Save as new version</Button>
                <Button variant="outline" onClick={() => download(tb.text, job.company)}>Download .txt</Button>
              </Row>
              {savedMsg && <div role="status" style={{ fontSize: 12.5, color: '#0b6247' }}>{savedMsg}</div>}
              <div style={{ fontSize: 12, fontWeight: 600, color: '#3c4452', marginTop: 6 }}>Resume versions</div>
              {versionsList.map((v) => (
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
