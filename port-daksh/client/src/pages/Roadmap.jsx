import { useState } from 'react';
import { AutoGrid, Bar, Button, Card, EmptyCard, Pill, Row, Segmented, Spacer, Stack } from '../components/ui.jsx';
import { roadmapPercent } from '../lib/derive.js';
import { difficultyTone } from '../lib/theme.js';
import { activeJobOf } from '../lib/derive.js';
import { useTasks } from '../state/TaskContext.jsx';
import { useWorkspace } from '../state/WorkspaceContext.jsx';

export default function Roadmap() {
  const { ws, set } = useWorkspace();
  const tasks = useTasks();
  const [phaseKey, setPhaseKey] = useState('7');
  const roadmap = ws.roadmap;
  const pct = roadmapPercent(ws);
  const phase = roadmap ? roadmap.phases.find((p) => p.key === phaseKey) || roadmap.phases[0] : null;
  const basisJob = roadmap ? ws.jobs.find((j) => j.id === roadmap.jobId) : null;

  const generate = async () => {
    const ok = await tasks.ai('Building your roadmap…', ['Ordering gaps by priority', 'Sizing each topic', 'Writing practice and projects'], 'roadmap', { jobId: activeJobOf(ws)?.id });
    if (ok) setPhaseKey('7');
  };

  const toggle = (index) =>
    set({
      roadmap: {
        ...roadmap,
        phases: roadmap.phases.map((p) => (p.key !== phase.key ? p : { ...p, tasks: p.tasks.map((t, i) => (i === index ? { ...t, done: !t.done } : t)) })),
      },
    });

  return (
    <Stack gap={16}>
      <Row gap={10} wrap>
        {roadmap && (
          <Segmented
            label="Roadmap phases"
            value={phase.key}
            onChange={setPhaseKey}
            items={roadmap.phases.map((p) => ({ key: p.key, label: p.label, badge: `${p.tasks.filter((t) => t.done).length}/${p.tasks.length}` }))}
          />
        )}
        <Row gap={10} style={{ fontSize: 13, color: '#5b6472' }}>
          <div style={{ width: 120 }}><Bar value={pct} color="#12805c" /></div>
          {pct}% overall
        </Row>
        <Spacer />
        {basisJob && <span style={{ fontSize: 12.5, color: '#5b6472' }}>Built from gaps for {basisJob.title} at {basisJob.company}</span>}
        <Button onClick={generate}>Generate roadmap from gaps</Button>
      </Row>

      {!roadmap && (
        <EmptyCard>
          No roadmap yet. Run the skill-gap detector for a job, then choose “Generate roadmap from gaps”.
        </EmptyCard>
      )}

      {phase && (
        <AutoGrid min={380}>
          {phase.tasks.map((tk, i) => {
            const tone = difficultyTone[tk.difficulty];
            return (
              <Card key={`${phase.key}-${tk.topic}`} pad={20} gap={12} style={{ borderColor: tk.done ? '#c6e8d7' : '#e5e7eb' }}>
                <Row gap={12} align="flex-start">
                  <button
                    onClick={() => toggle(i)}
                    role="checkbox"
                    aria-checked={tk.done}
                    aria-label={`Mark "${tk.topic}" ${tk.done ? 'not done' : 'done'}`}
                    style={{ all: 'unset', cursor: 'pointer', width: 22, height: 22, borderRadius: 7, boxSizing: 'border-box', border: `1.5px solid ${tk.done ? '#12805c' : '#c4c9d2'}`, background: tk.done ? '#12805c' : '#fff', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 13, flex: 'none', marginTop: 1 }}
                  >
                    {tk.done ? '✓' : ''}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 16, textDecoration: tk.done ? 'line-through' : 'none' }}>{tk.topic}</div>
                    <div style={{ fontSize: 13, color: '#5b6472', marginTop: 2 }}>{tk.why}</div>
                  </div>
                  <Stack gap={4} align="flex-end" style={{ flex: 'none' }}>
                    <Pill small tone={tone}>{tk.difficulty}</Pill>
                    <span className="mono" style={{ fontSize: 12, color: '#8b93a1' }}>~{tk.hours}h</span>
                  </Stack>
                </Row>
                <div style={{ display: 'grid', gridTemplateColumns: '110px minmax(0,1fr)', gap: '8px 12px', fontSize: 13, lineHeight: 1.5 }}>
                  <span style={{ color: '#8b93a1' }}>Objective</span><span>{tk.objective}</span>
                  <span style={{ color: '#8b93a1' }}>Practice</span><span>{tk.practice}</span>
                  <span style={{ color: '#8b93a1' }}>Project</span><span>{tk.project}</span>
                  <span style={{ color: '#8b93a1' }}>Interview Qs</span><span style={{ color: 'var(--acc-i)' }}>{tk.questions.join('  ·  ')}</span>
                </div>
              </Card>
            );
          })}
        </AutoGrid>
      )}
    </Stack>
  );
}
