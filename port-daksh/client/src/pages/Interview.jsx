import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { AutoGrid, Button, Card, Chip, EmptyCard, Field, Pill, Row, Segmented, Spacer, Split, Stack, TextArea } from '../components/ui.jsx';
import NoJob from '../components/NoJob.jsx';
import { activeJobOf, interviewAverage } from '../lib/derive.js';
import { INTERVIEW_TABS } from '../lib/nav.js';
import { riskTone } from '../lib/theme.js';
import { useTasks } from '../state/TaskContext.jsx';
import { useWorkspace } from '../state/WorkspaceContext.jsx';

const CATEGORIES = ['Technical', 'Resume', 'Project', 'Behavioral', 'HR', 'Role-specific'];
const stickyPanel = { position: 'sticky', top: 20 };

/** Covered / missing columns shared by both evaluation views. */
function Coverage({ covered, missing, coveredLabel, missingLabel }) {
  return (
    <AutoGrid min={180} gap={12} style={{ fontSize: 13.5 }}>
      <div>
        <div style={{ fontWeight: 600, color: '#0b6247', marginBottom: 4 }}>{coveredLabel}</div>
        {covered.map((x) => <div key={x}>· {x}</div>)}
      </div>
      <div>
        <div style={{ fontWeight: 600, color: '#a8322a', marginBottom: 4 }}>{missingLabel}</div>
        {missing.map((x) => <div key={x}>· {x}</div>)}
      </div>
    </AutoGrid>
  );
}

function PracticeTab({ ws, merge, tasks, filter, setFilter, selected, setSelected }) {
  const questions = ws.questions || [];
  if (!activeJobOf(ws)) return <NoJob tool="The interview predictor" />;
  if (!questions.length) return <EmptyCard>No questions yet. Choose “Predict questions” to generate likely questions for this job.</EmptyCard>;
  const cats = ['All', ...CATEGORIES.filter((c) => questions.some((q) => q.category === c))];
  const visible = questions.map((q, i) => ({ ...q, i })).filter((q) => filter === 'All' || q.category === filter);
  const sel = questions[selected];
  const ev = ws.evals[selected];
  const answer = ws.answers[selected] || '';

  const evaluate = () =>
    tasks.ai('Evaluating your answer…', ['Reading your answer', 'Comparing with expected areas', 'Checking against resume claims'], 'answer-evaluation', { index: selected, answer });

  return (
    <Split cols="minmax(0,.9fr) minmax(0,1.3fr)" align="start">
      <Stack gap={8}>
        <Row gap={6} wrap style={{ marginBottom: 4 }}>
          {cats.map((c) => <Chip key={c} active={filter === c} onClick={() => setFilter(c)}>{c}</Chip>)}
        </Row>
        {visible.map((q) => (
          <button key={q.i} className="pick" aria-pressed={q.i === selected} onClick={() => setSelected(q.i)}>
            <Row gap={8} style={{ fontSize: 12 }}>
              <span style={{ color: 'var(--acc-i)', fontWeight: 600 }}>{q.category}</span>
              <span style={{ color: '#8b93a1' }}>{q.difficulty}</span>
              <span className="mono" style={{ marginLeft: 'auto', color: '#0b6247', fontWeight: 600 }}>{ws.evals[q.i] ? ws.evals[q.i].score : ''}</span>
            </Row>
            <div style={{ fontSize: 14, lineHeight: 1.45 }}>{q.question}</div>
          </button>
        ))}
      </Stack>

      {sel && (
        <Card pad={24} gap={14} style={stickyPanel}>
          <Row gap={6}>
            <Pill style={{ background: 'var(--acc-t)', color: 'var(--acc-i)' }}>{sel.category}</Pill>
            <Pill style={{ background: '#f1f3f5', color: '#3c4452', fontWeight: 400 }}>{sel.difficulty}</Pill>
          </Row>
          <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-.02em', lineHeight: 1.3 }}>{sel.question}</div>
          <div style={{ fontSize: 13.5, color: '#4a5260' }}><b style={{ fontWeight: 600 }}>Why they may ask.</b> {sel.why}</div>
          <AutoGrid min={200} gap={12}>
            <div className="tile">
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Expected answer areas</div>
              {sel.expect.map((x) => <div key={x} style={{ fontSize: 13.5 }}>· {x}</div>)}
            </div>
            <div className="tile">
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Likely follow-ups</div>
              {sel.followups.map((x) => <div key={x} style={{ fontSize: 13.5 }}>· {x}</div>)}
            </div>
          </AutoGrid>
          <Field label="Your answer">
            <TextArea
              style={{ minHeight: 140, lineHeight: 1.55 }}
              placeholder="Answer as you would out loud. Specifics from your own work score better than definitions."
              value={answer}
              onChange={(e) => merge('answers', { [selected]: e.target.value })}
            />
          </Field>
          <div>
            <Button onClick={evaluate} style={{ opacity: answer.trim() && !tasks.loading ? 1 : 0.5 }}>Evaluate answer</Button>
          </div>
          {ev && (
            <Stack gap={10} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
              <Row gap={10} align="baseline" wrap>
                <span style={{ fontSize: 34, fontWeight: 650, letterSpacing: '-.04em', lineHeight: 1 }}>{ev.score}</span>
                <span style={{ fontSize: 13, color: '#8b93a1' }}>/ 100 answer strength · estimate</span>
                <Pill tone={riskTone(ev.credibility)} style={{ marginLeft: 'auto' }}>Credibility risk: {ev.credibility}</Pill>
              </Row>
              <div style={{ fontSize: 14, lineHeight: 1.5 }}>{ev.summary}</div>
              <Coverage covered={ev.covered} missing={ev.missing} coveredLabel="Covered" missingLabel="Missing" />
              <div style={{ fontSize: 13.5, color: '#4a5260' }}>{ev.credibilityNote}</div>
              <div style={{ fontSize: 13.5 }}><b style={{ fontWeight: 600 }}>Stronger structure.</b> {ev.betterAnswer}</div>
            </Stack>
          )}
        </Card>
      )}
    </Split>
  );
}

function ConsistencyTab({ ws, merge, tasks, selected, setSelected }) {
  const claims = ws.analysis?.claims || [];
  if (!claims.length) return <EmptyCard>No resume claims to test yet. Analyze your resume first, then come back.</EmptyCard>;
  const claim = claims[selected];
  const test = ws.claimTests[selected];

  const generate = () => tasks.ai('Writing a probing question…', ['Reading the claim', 'Choosing the right depth'], 'claim-question', { index: selected });
  const check = () =>
    tasks.ai('Checking consistency…', ['Reading your answer', 'Comparing with the claimed level'], 'claim-evaluation', { index: selected, answer: test?.answer || '' });

  return (
    <Stack gap={14}>
      <p style={{ fontSize: 14, lineHeight: 1.55, color: '#4a5260', maxWidth: 720, margin: 0 }}>
        Each claim on your resume implies a level of knowledge. Pick one, answer a probing question, and see whether your answer currently supports it. This measures the answer, not your honesty.
      </p>
      <Split cols="minmax(0,.9fr) minmax(0,1.3fr)" align="start">
        <Stack gap={8}>
          {claims.map((c, i) => {
            const result = ws.claimTests[i]?.ev;
            return (
              <button key={c.claim} className="pick" style={{ gap: 8 }} aria-pressed={i === selected} onClick={() => setSelected(i)}>
                <div style={{ fontWeight: 600, fontSize: 14.5 }}>“{c.claim}”</div>
                <div style={{ fontSize: 12.5, color: '#5b6472' }}>Evidence: {c.evidence}</div>
                <Row gap={6} wrap>
                  <Pill small tone={riskTone(c.risk)}>Prior risk: {c.risk}</Pill>
                  {result && <Pill small tone={riskTone(result.credibility)}>After test: {result.credibility}</Pill>}
                </Row>
              </button>
            );
          })}
        </Stack>

        {claim && (
          <Card pad={24} gap={14} style={stickyPanel}>
            <span className="mono-label">Testing claim</span>
            <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-.02em' }}>“{claim.claim}”</div>
            {!test && <div><Button onClick={generate}>Generate a probing question</Button></div>}
            {test?.question && (
              <>
                <div style={{ background: '#f7f8fa', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{test.question}</div>
                  <div style={{ fontSize: 12.5, color: '#6b7280' }}>Tests: {test.testing}</div>
                </div>
                <Field label="Your answer">
                  <TextArea
                    style={{ minHeight: 140, lineHeight: 1.55 }}
                    value={test.answer}
                    onChange={(e) => merge('claimTests', { [selected]: { ...test, answer: e.target.value } })}
                  />
                </Field>
                <div><Button onClick={check}>Check consistency</Button></div>
              </>
            )}
            {test?.ev && (
              <Stack gap={10} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
                <Row gap={10}>
                  <span style={{ fontSize: 16, fontWeight: 600 }}>Credibility risk</span>
                  <Pill tone={riskTone(test.ev.credibility)} style={{ fontSize: 12.5, padding: '3px 10px', fontWeight: 600 }}>{test.ev.credibility}</Pill>
                </Row>
                <div style={{ fontSize: 14, lineHeight: 1.5 }}>{test.ev.credibilityNote}</div>
                <Coverage covered={test.ev.covered} missing={test.ev.missing} coveredLabel="Demonstrated" missingLabel="Not yet shown" />
              </Stack>
            )}
          </Card>
        )}
      </Split>
    </Stack>
  );
}

export default function Interview() {
  const { tab } = useParams();
  const navigate = useNavigate();
  const { ws, merge } = useWorkspace();
  const tasks = useTasks();
  // Selection and filter state lives here so the header's "Predict questions" can reset it.
  const [filter, setFilter] = useState('All');
  const [selectedQ, setSelectedQ] = useState(0);
  const [selectedClaim, setSelectedClaim] = useState(0);

  if (!INTERVIEW_TABS.includes(tab)) return <Navigate to="/app/interview/practice" replace />;

  const { count, avg } = interviewAverage(ws);
  const stats = count ? `${count} answer${count > 1 ? 's' : ''} evaluated · average ${avg}` : 'No answers evaluated yet';

  const predict = async () => {
    const ok = await tasks.ai(
      'Predicting interview questions…',
      ['Reading resume and job', 'Finding likely focus areas', 'Writing questions', 'Adding follow-ups'],
      'interview-questions',
      { jobId: activeJobOf(ws)?.id },
    );
    if (ok) { setFilter('All'); setSelectedQ(0); }
  };

  return (
    <Stack gap={16}>
      <Row gap={10} wrap>
        <Segmented
          label="Interview tools"
          value={tab}
          onChange={(k) => navigate(`/app/interview/${k}`)}
          items={[{ key: 'practice', label: 'Interview practice' }, { key: 'consistency', label: 'Resume consistency' }]}
        />
        <span style={{ fontSize: 13, color: '#5b6472' }}>{stats}</span>
        <Spacer />
        {tab === 'practice' && activeJobOf(ws) && <Button onClick={predict}>Predict questions</Button>}
      </Row>
      {tab === 'practice' ? (
        <PracticeTab ws={ws} merge={merge} tasks={tasks} filter={filter} setFilter={setFilter} selected={selectedQ} setSelected={setSelectedQ} />
      ) : (
        <ConsistencyTab ws={ws} merge={merge} tasks={tasks} selected={selectedClaim} setSelected={setSelectedClaim} />
      )}
    </Stack>
  );
}
