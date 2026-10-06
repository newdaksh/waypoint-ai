import { useEffect, useRef, useState } from 'react';
import { Button, Card, LinkButton, MonoLabel, Split, Stack } from '../components/ui.jsx';
import { useTasks } from '../state/TaskContext.jsx';
import { useWorkspace } from '../state/WorkspaceContext.jsx';

const SUGGESTIONS = [
  'Am I ready for this job?',
  'Why is my resume score low?',
  'What should I learn this week?',
  'Which job should I apply to first?',
  'Prepare me for this interview.',
  'Which resume version performed best?',
];
// What the server includes in the assistant's context (see server/src/ai/context.js).
const SHARED_CONTEXT = [
  'Target role and goals',
  'Resume scores, skills and red flags',
  'Experience bullets (no contact info)',
  'Saved jobs and priorities',
  'Application results by version',
  'Roadmap and practice scores',
];

export default function Assistant() {
  const { ws, apply, set, chat } = useWorkspace();
  const tasks = useTasks();
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const endRef = useRef(null);
  const messages = ws.chat;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages.length, thinking]);

  const send = async (text) => {
    const message = (typeof text === 'string' ? text : draft).trim();
    if (!message || thinking) return;
    // Show the user's turn immediately; the server stores it and returns the full conversation.
    apply({ set: { chat: [...messages, { role: 'user', content: message }] } });
    setDraft('');
    setThinking(true);
    try {
      await chat(message);
    } catch (e) {
      tasks.fail(e.message);
    } finally {
      setThinking(false);
    }
  };

  return (
    <Split cols="minmax(0,1fr) 280px" align="start">
      <Card pad={0} style={{ display: 'flex', flexDirection: 'column', minHeight: 560 }}>
        <div style={{ flex: 1, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }} aria-live="polite">
          {!messages.length && (
            <Stack gap={14} style={{ padding: '20px 0' }}>
              <div style={{ fontSize: 20, fontWeight: 620, letterSpacing: '-.02em' }}>Ask about your search.</div>
              <div style={{ fontSize: 14, color: '#5b6472', maxWidth: 520, lineHeight: 1.55 }}>
                The assistant sees a summary of your profile, scores, saved jobs, applications and roadmap. It doesn't see your contact details.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="suggestion" onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            </Stack>
          )}
          {messages.map((m, i) => {
            const mine = m.role === 'user';
            return (
              <div key={i} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '78%', padding: '11px 14px', borderRadius: 12, fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap', background: mine ? 'var(--acc)' : '#f3f4f6', color: mine ? '#fff' : '#0f1218' }}>
                  {m.content}
                </div>
              </div>
            );
          })}
          {thinking && <div style={{ fontSize: 13, color: '#8b93a1' }}>Thinking…</div>}
          <div ref={endRef} />
        </div>
        <div style={{ borderTop: '1px solid #eef0f3', padding: 12, display: 'flex', gap: 8 }}>
          <input
            className="input"
            style={{ flex: 1, height: 42, borderRadius: 10, padding: '0 14px' }}
            placeholder="Ask anything about your resume, jobs or interviews"
            aria-label="Message"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          />
          <Button onClick={() => send()} disabled={thinking} style={{ height: 42, borderRadius: 10, padding: '0 16px', fontSize: 14 }}>Send</Button>
        </div>
      </Card>

      <Card pad={18} gap={8}>
        <MonoLabel>Context shared</MonoLabel>
        {SHARED_CONTEXT.map((c) => (
          <div key={c} style={{ fontSize: 13, display: 'flex', gap: 8 }}><span style={{ color: '#12805c' }}>✓</span>{c}</div>
        ))}
        <div style={{ fontSize: 13, display: 'flex', gap: 8, color: '#8b93a1' }}><span>✕</span>Email, phone, full resume text</div>
        {messages.length > 0 && (
          <LinkButton onClick={() => set({ chat: [] })} style={{ color: '#5b6472', fontWeight: 400, marginTop: 8, fontSize: 12.5 }}>Clear conversation</LinkButton>
        )}
      </Card>
    </Split>
  );
}
