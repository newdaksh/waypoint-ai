import { Card, Row } from './ui.jsx';

/** The "what is happening now" card shown while a long task runs: its steps, with the current one marked. */
export default function ProgressCard({ title, steps, stepIdx, style }) {
  return (
    <Card
      role="status"
      aria-live="polite"
      pad="18px 20px"
      gap={9}
      style={{ border: '1px solid var(--acc-b)', borderRadius: 14, boxShadow: '0 8px 24px rgba(59,91,219,.08)', ...style }}
    >
      <div style={{ fontWeight: 600, fontSize: 15 }}>{title}</div>
      {steps.map((label, i) => {
        const done = i < stepIdx;
        const active = i === stepIdx;
        return (
          <Row key={label} gap={10} style={{ fontSize: 13.5, color: done || active ? '#0f1218' : '#8b93a1' }}>
            <span style={{ width: 18, height: 18, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 10, color: '#fff', background: done ? '#12805c' : active ? 'var(--acc)' : '#dfe2e7' }}>
              {done ? '✓' : active ? '•' : ''}
            </span>
            <span>{label}</span>
          </Row>
        );
      })}
    </Card>
  );
}
