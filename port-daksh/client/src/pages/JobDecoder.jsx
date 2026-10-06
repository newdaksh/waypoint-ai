import { Button, Card, AutoGrid, EmptyCard, Row, Split, Stack } from '../components/ui.jsx';
import { activeJobOf, jobLabelOf } from '../lib/derive.js';
import { useTasks } from '../state/TaskContext.jsx';
import NoJob from '../components/NoJob.jsx';
import { useWorkspace } from '../state/WorkspaceContext.jsx';

const darkLabel = { fontFamily: "'Geist Mono', monospace", fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9fb0f5', marginBottom: 8 };

/** A titled list where every row starts with a coloured glyph. */
function ListCard({ title, titleColor, glyph, glyphColor, items }) {
  return (
    <Card pad={20} gap={8}>
      <div style={{ fontWeight: 600, fontSize: 14, color: titleColor }}>{title}</div>
      {items.map((x) => (
        <div key={x} style={{ fontSize: 13.5, display: 'flex', gap: 8 }}>
          <span style={{ color: glyphColor }}>{glyph}</span>
          {x}
        </div>
      ))}
    </Card>
  );
}

function JobDecoderBody() {
  const { ws } = useWorkspace();
  const tasks = useTasks();
  const job = activeJobOf(ws);
  const d = ws.decoderBy[job.id];

  const run = () =>
    tasks.ai(
      'Decoding the job description…',
      ['Reading the posting', 'Separating must-haves from nice-to-haves', 'Looking for hidden signals', 'Assessing your suitability'],
      'decoder',
      { jobId: job.id },
    );

  return (
    <Stack gap={16}>
      <Row justify="flex-end"><Button onClick={run}>Decode this job</Button></Row>
      {!d && <EmptyCard>{jobLabelOf(job)} hasn't been decoded yet.</EmptyCard>}
      {d && (
        <>
          <Split cols="minmax(0,1fr) minmax(0,1fr)" gap={28} style={{ background: '#0f1218', color: '#fff', borderRadius: 14, padding: 26 }}>
            <div>
              <div style={darkLabel}>Role summary</div>
              <div style={{ fontSize: 17, lineHeight: 1.5 }}>{d.summary}</div>
            </div>
            <div>
              <div style={darkLabel}>What they really want</div>
              <div style={{ fontSize: 15, lineHeight: 1.55, color: '#d3d8e0' }}>{d.reallyWants}</div>
            </div>
          </Split>

          <AutoGrid min={260}>
            <ListCard title="Must-have skills" titleColor="#a8322a" glyph="●" glyphColor="#d1453b" items={d.mustHave} />
            <ListCard title="Nice-to-have" titleColor="#8a5a12" glyph="●" glyphColor="#b7791f" items={d.niceToHave} />
            <ListCard title="Responsibilities" glyph="●" glyphColor="#8b93a1" items={d.responsibilities} />
          </AutoGrid>

          <AutoGrid min={260}>
            <Card pad={20} gap={12}>
              <div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Seniority</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{d.seniority}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Experience expectation</div>
                <div style={{ fontSize: 14, lineHeight: 1.5 }}>{d.experience}</div>
              </div>
            </Card>
            <Card pad={20} gap={8}>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--acc-i)' }}>Likely interview focus</div>
              {d.interviewFocus.map((x) => <div key={x} style={{ fontSize: 13.5 }}>→ {x}</div>)}
            </Card>
            <Card pad={20} gap={8}>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#5531c4' }}>Hidden signals</div>
              {d.hiddenSignals.map((x) => <div key={x} style={{ fontSize: 13.5, lineHeight: 1.5 }}>{x}</div>)}
            </Card>
          </AutoGrid>

          <div style={{ background: '#e6f5ee', border: '1px solid #c6e8d7', borderRadius: 14, padding: '18px 20px' }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#0b6247', marginBottom: 4 }}>Candidate suitability</div>
            <div style={{ fontSize: 14, lineHeight: 1.55, color: '#0d3d2d' }}>{d.suitability}</div>
          </div>
        </>
      )}
    </Stack>
  );
}

export default function JobDecoder() {
  const { ws } = useWorkspace();
  return activeJobOf(ws) ? <JobDecoderBody /> : <NoJob tool="The job decoder" />;
}
