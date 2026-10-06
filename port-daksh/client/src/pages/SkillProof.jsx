import { Button, Card, EmptyCard, Pill, Row, Spacer, Stack } from '../components/ui.jsx';
import { activeJobOf, jobLabelOf } from '../lib/derive.js';
import { pill } from '../lib/theme.js';
import { useTasks } from '../state/TaskContext.jsx';
import NoJob from '../components/NoJob.jsx';
import { useWorkspace } from '../state/WorkspaceContext.jsx';

const STATUS_TONE = { Proven: pill.green, Partial: pill.amber, Unproven: pill.red };
const COLUMNS = '170px minmax(0,1fr) minmax(0,1fr) minmax(0,1.2fr)';

function SkillProofBody() {
  const { ws } = useWorkspace();
  const tasks = useTasks();
  const job = activeJobOf(ws);
  const items = ws.proofBy[job.id] || [];

  const run = () =>
    tasks.ai('Checking skill proof…', ['Listing important skills', 'Searching your resume for evidence', 'Suggesting proof'], 'skill-proof', { jobId: job.id });

  return (
    <Stack gap={16}>
      <Row gap={10} wrap>
        {items.length > 0 &&
          Object.keys(STATUS_TONE).map((k) => (
            <Pill key={k} tone={STATUS_TONE[k]} style={{ fontSize: 13, padding: '6px 12px' }}>
              {items.filter((p) => p.status === k).length} {k.toLowerCase()}
            </Pill>
          ))}
        <Spacer />
        <Button onClick={run}>Check proof for this job</Button>
      </Row>

      {!items.length && <EmptyCard>No skill-proof check for {jobLabelOf(job)} yet.</EmptyCard>}

      {items.length > 0 && (
        <Card pad={0} className="table-wrap">
          <div style={{ minWidth: 760 }}>
            <div style={{ display: 'grid', gridTemplateColumns: COLUMNS, gap: 16, padding: '10px 18px', background: '#f7f8fa', fontSize: 12, color: '#6b7280', fontWeight: 500 }}>
              <span>Skill</span><span>Existing evidence</span><span>Evidence gap</span><span>Recommended proof</span>
            </div>
            {items.map((p) => (
              <div key={p.skill} style={{ display: 'grid', gridTemplateColumns: COLUMNS, gap: 16, padding: '16px 18px', borderTop: '1px solid #f1f2f5', fontSize: 13.5, lineHeight: 1.5 }}>
                <Stack gap={6} align="flex-start">
                  <span style={{ fontWeight: 600 }}>{p.skill}</span>
                  <Pill small tone={STATUS_TONE[p.status]}>{p.status}</Pill>
                </Stack>
                <div style={{ color: '#3c4452' }}>{p.evidence}</div>
                <div style={{ color: '#5b6472' }}>{p.gap}</div>
                <div>
                  <div>{p.proof}</div>
                  {p.idea && (
                    <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--acc-i)', background: 'var(--acc-t)', borderRadius: 8, padding: '7px 10px' }}>
                      Project idea: {p.idea}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </Stack>
  );
}

export default function SkillProof() {
  const { ws } = useWorkspace();
  return activeJobOf(ws) ? <SkillProofBody /> : <NoJob tool="The skill-proof check" />;
}
