import { useState } from 'react';
import { Button, Card, AutoGrid, Field, LinkButton, Pill, Row, Stack, TextArea } from '../components/ui.jsx';
import { activeJobOf, jobLabelOf } from '../lib/derive.js';
import { pill } from '../lib/theme.js';
import { useTasks } from '../state/TaskContext.jsx';
import { useWorkspace } from '../state/WorkspaceContext.jsx';

export default function BulletOptimizer() {
  const { ws, set } = useWorkspace();
  const tasks = useTasks();
  const job = activeJobOf(ws);
  const [copied, setCopied] = useState(-1);
  const result = ws.bullets;

  const generate = async () => {
    const ok = await tasks.ai('Rewriting bullet…', ['Reading the bullet', 'Finding supporting facts in your resume', 'Writing variants'], 'bullets', {
      bullet: ws.bulletInput,
      jobId: job?.id,
    });
    if (ok) setCopied(-1);
  };

  const copy = async (text, i) => {
    try { await navigator.clipboard.writeText(text); } catch { /* clipboard unavailable (e.g. insecure context) */ }
    setCopied(i);
  };

  return (
    <Stack gap={16} style={{ maxWidth: 1000 }}>
      <Card pad={20} gap={12}>
        <Field label="Resume bullet">
          <TextArea style={{ minHeight: 76, fontSize: 15 }} value={ws.bulletInput} onChange={(e) => set({ bulletInput: e.target.value })} />
        </Field>
        <Row gap={10} wrap>
          <Button onClick={generate}>Generate versions</Button>
          <span style={{ fontSize: 12.5, color: '#5b6472' }}>Uses your resume and {jobLabelOf(job)} as context. Never invents results.</span>
        </Row>
      </Card>

      {result && (
        <>
          <AutoGrid min={300} gap={12}>
            {result.variants.map((v, i) => (
              <Card key={`${v.style}-${i}`} pad={18} gap={10} style={{ borderRadius: 12 }}>
                <Row justify="space-between">
                  <Pill tone={pill.violet} style={{ fontWeight: 600 }}>{v.style}</Pill>
                  <LinkButton onClick={() => copy(v.text, i)} style={{ fontSize: 12.5 }}>{copied === i ? 'Copied' : 'Copy'}</LinkButton>
                </Row>
                <div style={{ fontSize: 15, lineHeight: 1.5 }}>{v.text}</div>
                <div style={{ fontSize: 12.5, color: '#5b6472' }}>{v.note}</div>
              </Card>
            ))}
          </AutoGrid>
          <div style={{ background: '#fcf3e1', border: '1px solid #f3e0b8', borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#8a5a12' }}>Add a real metric</div>
            {result.metricPrompts.map((x) => <div key={x} style={{ fontSize: 13.5, color: '#5c3d0c' }}>· {x}</div>)}
          </div>
        </>
      )}
    </Stack>
  );
}
