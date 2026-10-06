import { Button, Card, Field, Pill, Row, Split, Stack, TextArea } from '../components/ui.jsx';
import { pill } from '../lib/theme.js';
import { useTasks } from '../state/TaskContext.jsx';
import { useWorkspace } from '../state/WorkspaceContext.jsx';

const SEVERITY_TONE = { High: pill.red, Medium: pill.amber, Low: pill.gray };
// [background, border, text] per overall level
const LEVEL_TONE = {
  'High risk indicators': ['#fdecea', '#f6c9c4', '#a8322a'],
  'Moderate risk indicators': ['#fcf3e1', '#f3e0b8', '#8a5a12'],
  'Low apparent risk': ['#e6f5ee', '#c6e8d7', '#0b6247'],
};

export default function JobSafety() {
  const { ws, set } = useWorkspace();
  const tasks = useTasks();
  const result = ws.safety;
  const [bg, border, fg] = LEVEL_TONE[result?.level] || LEVEL_TONE['Low apparent risk'];

  const assess = () =>
    tasks.ai(
      'Assessing risk indicators…',
      ['Checking payment and document requests', 'Checking contact details', 'Checking the hiring process'],
      'safety',
      { text: ws.safetyInput },
    );

  return (
    <Split cols="minmax(0,.9fr) minmax(0,1.1fr)" align="start">
      <Card pad={20} gap={12}>
        <Field label="Job post, recruiter message or email">
          <TextArea style={{ minHeight: 300, fontSize: 13.5, lineHeight: 1.55, padding: 12 }} value={ws.safetyInput} onChange={(e) => set({ safetyInput: e.target.value })} />
        </Field>
        <div><Button onClick={assess}>Assess risk</Button></div>
        <div style={{ fontSize: 12, color: '#8b93a1', lineHeight: 1.5 }}>
          A risk assessment of warning signals in the text. It is not a verdict on whether the job is real.
        </div>
      </Card>

      {result && (
        <Stack gap={12}>
          <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: 20 }}>
            <div className="mono-label" style={{ color: fg, marginBottom: 6 }}>Job risk assessment</div>
            <div style={{ fontSize: 22, fontWeight: 620, letterSpacing: '-.02em', color: fg }}>{result.level}</div>
            <div style={{ fontSize: 14, lineHeight: 1.55, marginTop: 6, color: '#3c4452' }}>{result.summary}</div>
          </div>
          {result.signals.map((s, i) => (
            <Card key={`${s.signal}-${i}`} pad="14px 16px" gap={6} style={{ borderRadius: 12 }}>
              <Row gap={8}>
                <Pill small tone={SEVERITY_TONE[s.severity]}>{s.severity}</Pill>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{s.signal}</span>
              </Row>
              <div className="mono" style={{ fontSize: 12.5, color: '#3c4452', background: '#f7f8fa', borderRadius: 6, padding: '6px 10px' }}>{s.quote}</div>
              <div style={{ fontSize: 13, color: '#5b6472' }}>{s.explain}</div>
            </Card>
          ))}
          <Card pad={16} gap={6} style={{ borderRadius: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Suggested next steps</div>
            {result.nextSteps.map((x) => <div key={x} style={{ fontSize: 13.5 }}>→ {x}</div>)}
          </Card>
        </Stack>
      )}
    </Split>
  );
}
