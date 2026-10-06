import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { pageMeta } from '../lib/nav.js';
import { activeJobOf } from '../lib/derive.js';
import { useTasks } from '../state/TaskContext.jsx';
import { useWorkspace } from '../state/WorkspaceContext.jsx';
import Sidebar from './Sidebar.jsx';
import { Card, Pill, Row, Stack } from './ui.jsx';

/** Marks results that were produced by the AI (as opposed to things the user typed). */
function aiBadge(ws, screen, tab) {
  const jid = activeJobOf(ws)?.id;
  // Per-job results carry their own flag, so switching target job shows the right one.
  const perJob = (key, map) => (map && jid && map[jid] ? ws.src[`${key}:${jid}`] : null);
  const sources = {
    dashboard: ws.src.analysis,
    onboarding: ws.analysis ? ws.src.analysis : null,
    resume: tab === 'ats' ? perJob('ats', ws.atsBy) : ws.src.analysis,
    tailor: perJob('tailor', ws.tailorBy),
    bullets: ws.bullets ? ws.src.bullets : null,
    proof: perJob('proof', ws.proofBy),
    jobs: ws.src.priority,
    decoder: perJob('decoder', ws.decoderBy),
    safety: ws.safety ? ws.src.safety : null,
    gap: perJob('gap', ws.gapBy),
    roadmap: ws.roadmap ? ws.src.roadmap : null,
    interview: ws.src.questions,
  };
  return sources[screen] === 'live' ? { label: 'AI result', tone: ['#e6f5ee', '#0b6247'] } : null;
}

export default function AppLayout() {
  const { pathname } = useLocation();
  const { ws, set, saveState } = useWorkspace();
  const { loading, stepIdx, error, retry, dismissError } = useTasks();
  const { screen, tab, crumb, title, desc, needsJob } = pageMeta(pathname);
  const job = activeJobOf(ws);
  const badge = aiBadge(ws, screen, tab);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <Row align="flex-end" gap={16} wrap style={{ marginBottom: 22 }}>
          <Stack gap={4} style={{ marginRight: 'auto', minWidth: 0 }}>
            <div className="mono-label">{crumb}</div>
            <h1 style={{ fontSize: 28, letterSpacing: '-.03em', fontWeight: 620, margin: 0 }}>{title}</h1>
            <div style={{ fontSize: 14, color: '#5b6472', maxWidth: 640 }}>{desc}</div>
          </Stack>

          {needsJob && job && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5, color: '#5b6472' }}>
              Target job
              <select
                className="select"
                style={{ height: 36, minWidth: 240, fontSize: 13.5 }}
                value={job.id}
                onChange={(e) => set({ activeJobId: e.target.value })}
              >
                {ws.jobs.map((j) => (
                  <option key={j.id} value={j.id}>{`${j.title} · ${j.company}`}</option>
                ))}
              </select>
            </label>
          )}

          <Row gap={8}>
            {saveState === 'error' && (
              <span role="status" style={{ fontSize: 12, color: '#a8322a' }}>Couldn't save changes · retrying</span>
            )}
            {badge && <Pill tone={badge.tone}>{badge.label}</Pill>}
          </Row>
        </Row>

        {error && (
          <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fdecea', border: '1px solid #f6c9c4', color: '#8a2a22', borderRadius: 12, padding: '12px 14px', marginBottom: 18 }}>
            <span style={{ flex: 1, fontSize: 14 }}>{error.message}</span>
            {error.canRetry && (
              <button className="btn btn--sm" style={{ background: '#d1453b', color: '#fff', height: 32, borderRadius: 8, padding: '0 12px' }} onClick={retry}>Retry</button>
            )}
            <button className="ghostbtn" style={{ color: 'inherit', fontSize: 13 }} onClick={dismissError}>Dismiss</button>
          </div>
        )}

        {loading && (
          <Card
            role="status"
            aria-live="polite"
            pad="18px 20px"
            gap={9}
            style={{ border: '1px solid var(--acc-b)', borderRadius: 14, marginBottom: 18, boxShadow: '0 8px 24px rgba(59,91,219,.08)' }}
          >
            <div style={{ fontWeight: 600, fontSize: 15 }}>{loading.title}</div>
            {loading.steps.map((label, i) => {
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
        )}

        <Outlet />
      </main>
    </div>
  );
}
