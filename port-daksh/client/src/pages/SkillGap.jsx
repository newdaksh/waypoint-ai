import { useNavigate } from 'react-router-dom';
import { AutoGrid, Button, Card, EmptyCard, Pill, Row, Stack } from '../components/ui.jsx';
import { activeJobOf, jobLabelOf } from '../lib/derive.js';
import { pill } from '../lib/theme.js';
import { useTasks } from '../state/TaskContext.jsx';
import NoJob from '../components/NoJob.jsx';
import { useWorkspace } from '../state/WorkspaceContext.jsx';

const PRIORITY_TONE = { 'Must Have': pill.red, Important: pill.amber, 'Nice to Have': pill.gray };

function SkillGapBody() {
  const navigate = useNavigate();
  const { ws } = useWorkspace();
  const tasks = useTasks();
  const job = activeJobOf(ws);
  const gap = ws.gapBy[job.id];

  const run = () =>
    tasks.ai('Detecting skill gaps…', ['Extracting required skills', 'Matching your evidence', 'Classifying priority'], 'skill-gap', { jobId: job.id });

  const columns = gap
    ? [['Skills you have', gap.have, '#12805c'], ["Skills you're missing", gap.missing, '#d1453b'], ['Needs strengthening', gap.strengthen, '#d99a2b']]
    : [];

  return (
    <Stack gap={16}>
      <Row gap={8} justify="flex-end" wrap>
        <Button variant="outline" onClick={() => navigate('/app/roadmap')}>View roadmap</Button>
        <Button onClick={run}>Detect skill gaps</Button>
      </Row>

      {!gap && <EmptyCard>No skill-gap analysis for {jobLabelOf(job)} yet.</EmptyCard>}

      {gap && (
        <AutoGrid min={280} align="start">
          {columns.map(([label, items, color]) => (
            <Card key={label} pad={0} style={{ overflow: 'hidden' }}>
              <Row gap={8} style={{ padding: '14px 18px', borderBottom: '1px solid #f1f2f5', borderTop: `3px solid ${color}` }}>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{label}</span>
                <span style={{ fontSize: 12, color: '#8b93a1' }}>{items.length}</span>
              </Row>
              {items.map((g) => (
                <Stack key={g.skill} gap={6} style={{ padding: '14px 18px', borderBottom: '1px solid #f1f2f5' }}>
                  <Row justify="space-between" gap={8}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{g.skill}</span>
                    <Pill small tone={PRIORITY_TONE[g.priority]}>{g.priority}</Pill>
                  </Row>
                  <div className="mono" style={{ fontSize: 12, color: '#5b6472', lineHeight: 1.5 }}>JD: “{g.evidence}”</div>
                  <div style={{ fontSize: 13, color: '#3c4452' }}>{g.note}</div>
                </Stack>
              ))}
            </Card>
          ))}
        </AutoGrid>
      )}
    </Stack>
  );
}

export default function SkillGap() {
  const { ws } = useWorkspace();
  return activeJobOf(ws) ? <SkillGapBody /> : <NoJob tool="The skill-gap detector" />;
}
