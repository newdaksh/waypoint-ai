import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AddJobCard, JobFields, useJobEditing } from '../components/JobForms.jsx';
import { AutoGrid, Button, Card, EmptyCard, Pill, Row, Spacer, Stack } from '../components/ui.jsx';
import { activeJobOf } from '../lib/derive.js';
import { pill } from '../lib/theme.js';
import { useResumeActions } from '../state/actions.js';
import { useWorkspace } from '../state/WorkspaceContext.jsx';

const sub = { fontSize: 12.5, color: '#5b6472' };

export default function TargetJobs() {
  const navigate = useNavigate();
  const { ws, set } = useWorkspace();
  const { runAts } = useResumeActions();
  const { update, remove } = useJobEditing();
  const [params] = useSearchParams();
  const job = activeJobOf(ws);
  const [adding, setAdding] = useState(params.get('add') === '1' || !job); // other pages link here to add the first job

  return (
    <Stack gap={16}>
      <Row gap={10} wrap>
        <span style={{ fontSize: 13, color: '#5b6472', flex: 1, minWidth: 260 }}>
          Add every job you are considering. Select one to make it the target: the tools then compare your resume with that job.
        </span>
        {ws.jobs.length > 1 && <Button variant="outline" onClick={() => navigate('/app/jobs')}>Compare &amp; prioritize</Button>}
        <Button onClick={() => setAdding((v) => !v)}>Add job</Button>
      </Row>

      {adding && <AddJobCard activate onDone={() => setAdding(false)} />}

      {!job && !adding && (
        <EmptyCard>
          <Stack gap={12} align="flex-start">
            <span>No target jobs yet. Paste the description of a role you're considering to get started.</span>
            <Button onClick={() => setAdding(true)}>Add your first job</Button>
          </Stack>
        </EmptyCard>
      )}

      {job && (
        <>
          <AutoGrid min={230} gap={10}>
            {ws.jobs.map((j) => {
              const ats = ws.atsBy[j.id];
              return (
                <button key={j.id} type="button" className="pick" aria-pressed={j.id === job.id} onClick={() => set({ activeJobId: j.id })}>
                  <Row justify="space-between" gap={8}>
                    <span style={{ fontWeight: 600, fontSize: 14, minWidth: 0, overflowWrap: 'anywhere' }}>{j.title || 'Untitled job'}</span>
                    {j.id === job.id && <Pill small tone={pill.blue}>Target</Pill>}
                  </Row>
                  <span style={sub}>{j.company}{j.location ? ` · ${j.location}` : ''}</span>
                  <span className="mono" style={{ fontSize: 12, color: '#8b93a1' }}>{ats ? `ATS score ${ats.score}` : 'not analyzed'}</span>
                </button>
              );
            })}
          </AutoGrid>

          <Card pad={24} gap={14}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 17 }}>Target job</div>
              <div style={{ fontSize: 13.5, color: '#5b6472' }}>Changes are saved as you type.</div>
            </div>
            <JobFields job={job} onChange={(key, value) => update(job.id, key, value)} minHeight={280} />
            <Row gap={8} wrap>
              <Button size="md" onClick={async () => { if (await runAts(job.id)) navigate('/app/dashboard'); }}>Analyze against this job</Button>
              <Button size="md" variant="outline" onClick={() => navigate('/app/dashboard')}>Go to dashboard</Button>
              <Spacer />
              <button className="ghostbtn" style={{ color: '#a8322a' }} onClick={() => remove(job)}>Delete job</button>
            </Row>
          </Card>
        </>
      )}
    </Stack>
  );
}
