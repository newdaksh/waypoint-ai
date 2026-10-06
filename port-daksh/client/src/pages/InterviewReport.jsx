import { INTERVIEW_FORMULA, INTERVIEW_SCORES } from '@waypoint/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import ProgressCard from '../components/ProgressCard.jsx';
import { AutoGrid, Bar, Bullet, Button, Card, EmptyCard, MonoLabel, Pill, Row, Spacer, Split, Stack } from '../components/ui.jsx';
import { difficultyTone, pill, scoreColor } from '../lib/theme.js';

const POLL_MS = 2500;
const REPORT_STEPS = ['Reading the transcript', 'Comparing answers with your resume', 'Scoring each answer', 'Writing the assessment'];

const minutes = (sec) => (sec < 60 ? `${Math.round(sec)} sec` : `${Math.round(sec / 60)} min`);
const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');
const END_REASONS = { user: 'Ended by you', completed: 'Completed', time: 'Time limit reached', disconnected: 'Connection lost', idle: 'Left paused too long', error: 'Could not start' };

/** Verdict → colour, from "Strong hire" (good) to "No hire" (bad). */
const verdictTone = (v) => (/^(Strong hire|Hire)$/.test(v) ? pill.green : v === 'Lean hire' ? pill.blue : v === 'Lean no hire' ? pill.amber : pill.red);
const answerTone = { Strong: pill.green, Adequate: pill.blue, Weak: pill.red, Unanswered: pill.gray };
const resumeTone = { Consistent: pill.green, Unverified: pill.amber, Inconsistent: pill.red, 'Not applicable': pill.gray };
const priorityTone = { High: pill.red, Medium: pill.amber, Low: pill.gray };

function ScoreRing({ value, size = 132 }) {
  const color = scoreColor(value);
  return (
    <div
      role="img"
      aria-label={`Overall score ${value} out of 100`}
      style={{ width: size, height: size, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center', background: `conic-gradient(${color} ${value * 3.6}deg, #eef0f3 0)` }}
    >
      <div style={{ width: size - 24, height: size - 24, borderRadius: '50%', background: '#fff', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: size / 3.4, fontWeight: 650, letterSpacing: '-.04em', lineHeight: 1 }}>{value}</div>
          <div style={{ fontSize: 11.5, color: '#8b93a1', marginTop: 2 }}>out of 100</div>
        </div>
      </div>
    </div>
  );
}

const List = ({ title, items, glyph, color }) => (
  <Card pad={20} gap={10}>
    <MonoLabel>{title}</MonoLabel>
    {items.length ? items.map((x) => <Bullet key={x} glyph={glyph} color={color}>{x}</Bullet>) : <span style={{ fontSize: 13.5, color: '#8b93a1' }}>Nothing to flag.</span>}
  </Card>
);

function QuestionRow({ q, index }) {
  return (
    <details className="lv-qrow">
      <summary>
        <span className="lv-qrow__n mono">{index + 1}</span>
        <span className="lv-qrow__q">{q.question}</span>
        <Row gap={6} style={{ flex: 'none' }}>
          {q.round && <Pill small tone={pill.gray}>{q.round}</Pill>}
          <Pill small tone={answerTone[q.verdict]}>{q.verdict}</Pill>
          <span className="mono" style={{ fontWeight: 650, minWidth: 28, textAlign: 'right', color: scoreColor(q.score) }}>{q.score}</span>
        </Row>
      </summary>
      <Stack gap={12} style={{ padding: '4px 4px 6px' }}>
        <Row gap={6} wrap>
          <Pill small tone={difficultyTone[q.difficulty]}>{q.difficulty}</Pill>
          <Pill small tone={resumeTone[q.resumeCheck]}>Resume: {q.resumeCheck}</Pill>
        </Row>
        <div style={{ fontSize: 14, lineHeight: 1.55 }}><b style={{ fontWeight: 600 }}>What you said.</b> {q.answerSummary}</div>
        {q.excerpt && <blockquote className="lv-quote">“{q.excerpt}”</blockquote>}
        <AutoGrid min={220} gap={14}>
          <Stack gap={5}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#0b6247' }}>What worked</span>
            {q.strengths.length ? q.strengths.map((x) => <Bullet key={x} glyph="✓" color="#12805c">{x}</Bullet>) : <span style={{ fontSize: 13, color: '#8b93a1' }}>—</span>}
          </Stack>
          <Stack gap={5}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#a8322a' }}>What was missing</span>
            {q.gaps.length ? q.gaps.map((x) => <Bullet key={x} glyph="–" color="#d1453b">{x}</Bullet>) : <span style={{ fontSize: 13, color: '#8b93a1' }}>—</span>}
          </Stack>
        </AutoGrid>
        <div style={{ fontSize: 14, lineHeight: 1.55 }}><b style={{ fontWeight: 600 }}>Feedback.</b> {q.feedback}</div>
        {q.betterAnswer && <div className="tile" style={{ fontSize: 13.5, lineHeight: 1.55 }}><b style={{ fontWeight: 600 }}>A stronger answer</b> would go like this: {q.betterAnswer}</div>}
      </Stack>
    </details>
  );
}

function Report({ iv, onPractice, onDelete }) {
  const r = iv.report;
  const scores = INTERVIEW_SCORES.map(([key, label, weight]) => ({ key, label, weight, value: r.scores[key], note: r.scoreNotes[key] }));
  const interviewer = iv.limits?.interviewer || 'Interviewer';
  return (
    <Stack gap={16}>
      <Card accent pad={24} style={{ background: 'linear-gradient(135deg, var(--acc-t), #fff 55%)' }}>
        <Row gap={24} wrap align="center">
          <ScoreRing value={r.overall} />
          <Stack gap={10} style={{ flex: 1, minWidth: 260 }}>
            <Row gap={10} wrap>
              <Pill tone={verdictTone(r.verdict)} style={{ fontSize: 13, padding: '4px 12px', fontWeight: 600 }}>{r.verdict}</Pill>
              <span style={{ fontSize: 12.5, color: '#5b6472' }}>Recruiter-style recommendation · estimate</span>
            </Row>
            <div style={{ fontSize: 20, fontWeight: 620, letterSpacing: '-.02em' }}>{iv.job.title} at {iv.job.company}</div>
            <div style={{ fontSize: 14.5, lineHeight: 1.55, color: '#2b3340' }}>{r.summary}</div>
            <Row gap={14} wrap style={{ fontSize: 12.5, color: '#5b6472' }}>
              <span>{when(iv.startedAt || iv.createdAt)}</span>
              <span>{minutes(iv.activeSeconds)} interviewed</span>
              <span>{r.questions.length} question{r.questions.length === 1 ? '' : 's'}</span>
              <span>Resume: {iv.resume.name}</span>
              <span>{END_REASONS[iv.endReason] || 'Finished'}</span>
            </Row>
          </Stack>
          <Stack gap={8}>
            <Button onClick={onPractice}>Practice again</Button>
            <Button variant="outline" onClick={onDelete}>Delete</Button>
          </Stack>
        </Row>
      </Card>

      <Card pad={22} gap={14}>
        <Row gap={10} wrap><span style={{ fontSize: 17, fontWeight: 620 }}>Score breakdown</span><Spacer /><span style={{ fontSize: 12.5, color: '#8b93a1' }}>Weight in the overall score shown beside each name</span></Row>
        <AutoGrid min={250} gap={12}>
          {scores.map((s) => (
            <div key={s.key} className="tile" style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <Row gap={8} align="baseline">
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{s.label}</span>
                <span style={{ fontSize: 11.5, color: '#8b93a1' }}>{s.weight}%</span>
                <Spacer />
                <span className="mono" style={{ fontSize: 18, fontWeight: 650, color: scoreColor(s.value) }}>{s.value}</span>
              </Row>
              <Bar value={s.value} color={scoreColor(s.value)} track="#e3e6eb" />
              {s.note && <span style={{ fontSize: 12.5, lineHeight: 1.45, color: '#4a5260' }}>{s.note}</span>}
            </div>
          ))}
        </AutoGrid>
        <span style={{ fontSize: 12, color: '#8b93a1' }}>{INTERVIEW_FORMULA}</span>
      </Card>

      <Card pad={22} gap={10}>
        <MonoLabel>Recruiter assessment</MonoLabel>
        <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.65, maxWidth: 820 }}>{r.recruiterAssessment}</p>
      </Card>

      <Split cols="minmax(0,1fr) minmax(0,1fr)" align="start">
        <List title="What went well" items={r.strengths} glyph="✓" color="#12805c" />
        <List title="Concerns a hiring panel would have" items={r.risks} glyph="!" color="#d99a2b" />
      </Split>

      <Split cols="minmax(0,1fr) minmax(0,1fr)" align="start">
        <Card pad={20} gap={12}>
          <MonoLabel>Strong answers</MonoLabel>
          {r.strongAnswers.length ? r.strongAnswers.map((a) => (
            <Stack key={a.question} gap={3}>
              <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>{a.question}</span>
              <span style={{ fontSize: 13.5, color: '#4a5260', lineHeight: 1.5 }}>{a.why}</span>
            </Stack>
          )) : <span style={{ fontSize: 13.5, color: '#8b93a1' }}>No answer stood out as strong this time.</span>}
        </Card>
        <Card pad={20} gap={12}>
          <MonoLabel>Weak answers</MonoLabel>
          {r.weakAnswers.length ? r.weakAnswers.map((a) => (
            <Stack key={a.question} gap={3}>
              <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>{a.question}</span>
              <span style={{ fontSize: 13.5, color: '#4a5260', lineHeight: 1.5 }}>{a.issue}</span>
              <span style={{ fontSize: 13.5, lineHeight: 1.5 }}><b style={{ fontWeight: 600, color: 'var(--acc-i)' }}>Fix.</b> {a.fix}</span>
            </Stack>
          )) : <span style={{ fontSize: 13.5, color: '#8b93a1' }}>No clearly weak answers.</span>}
        </Card>
      </Split>

      <Card pad={20} gap={10}>
        <MonoLabel>Missed opportunities</MonoLabel>
        {r.missedOpportunities.length ? r.missedOpportunities.map((x) => <Bullet key={x} glyph="→" color="var(--acc)">{x}</Bullet>) : <span style={{ fontSize: 13.5, color: '#8b93a1' }}>None noted.</span>}
      </Card>

      <Card pad={22} gap={12}>
        <Row gap={10} wrap><span style={{ fontSize: 17, fontWeight: 620 }}>Question by question</span><Spacer /><span style={{ fontSize: 12.5, color: '#8b93a1' }}>Open a question for details</span></Row>
        <div className="lv-qlist">{r.questions.map((q, i) => <QuestionRow key={`${i}-${q.question}`} q={q} index={i} />)}</div>
      </Card>

      <Card pad={22} gap={12}>
        <span style={{ fontSize: 17, fontWeight: 620 }}>How to improve</span>
        <AutoGrid min={260} gap={12}>
          {r.recommendations.map((x) => (
            <div key={x.title} className="tile" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Row gap={8}><span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35 }}>{x.title}</span><Spacer /><Pill small tone={priorityTone[x.priority]}>{x.priority}</Pill></Row>
              <span style={{ fontSize: 13.5, lineHeight: 1.5, color: '#3c4452' }}>{x.detail}</span>
            </div>
          ))}
        </AutoGrid>
      </Card>

      <Card pad={22} gap={12}>
        <Row gap={10} wrap>
          <span style={{ fontSize: 17, fontWeight: 620 }}>Questions to practise before another attempt</span>
          <Spacer />
          <Button onClick={onPractice}>Start another interview</Button>
        </Row>
        <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14, lineHeight: 1.5 }}>
          {r.nextAttemptQuestions.map((q) => <li key={q}>{q}</li>)}
        </ol>
      </Card>

      <details className="card lv-transcript-full" style={{ padding: '14px 20px' }}>
        <summary>Full transcript ({iv.transcript.length} turns)</summary>
        <Stack gap={10} style={{ marginTop: 12 }}>
          {iv.transcript.map((t) => (
            <div key={t.id} style={{ display: 'flex', gap: 12, fontSize: 13.5, lineHeight: 1.55 }}>
              <span className="mono" style={{ flex: 'none', width: 44, color: '#8b93a1' }}>{clock(t.t || 0)}</span>
              <span style={{ flex: 'none', width: 78, fontWeight: 600, color: t.role === 'candidate' ? 'var(--acc-i)' : '#3c4452' }}>{t.role === 'candidate' ? 'You' : interviewer}</span>
              <span>{t.text}{t.interrupted ? ' …' : ''}</span>
            </div>
          ))}
        </Stack>
      </details>

      <span style={{ fontSize: 12, color: '#8b93a1', lineHeight: 1.5 }}>
        Scores are estimates made from the speech transcript by an AI model ({r.meta?.model}); they cannot hear tone of voice and they are not a hiring decision.
        Speech recognition can misspell names and terms.
      </span>
    </Stack>
  );
}

/** One interview: its report, or what is happening to it (still running, report on its way, failed, too short). */
export default function InterviewReport() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [iv, setIv] = useState(null);
  const [error, setError] = useState(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const { interview } = await api.interviews.get(id);
      if (alive.current) setIv(interview);
      return interview;
    } catch (e) {
      if (alive.current) setError(e);
      return null;
    }
  }, [id]);

  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  // While the report is being written, check back until it is there.
  const waiting = iv?.status === 'ended' && (iv.reportStatus === 'none' || iv.reportStatus === 'generating');
  useEffect(() => {
    if (!waiting) return undefined;
    const poll = setInterval(load, POLL_MS);
    const steps = setInterval(() => setStep((s) => Math.min(s + 1, REPORT_STEPS.length - 1)), 2200);
    return () => {
      clearInterval(poll);
      clearInterval(steps);
    };
  }, [waiting, load]);

  const act = async (fn) => {
    setBusy(true);
    try {
      const { interview } = await fn();
      if (alive.current) {
        setIv(interview);
        setStep(0);
      }
    } catch (e) {
      if (alive.current) setError(e);
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const practice = () => navigate(`/app/live?resume=${encodeURIComponent(iv.resume.id)}&job=${encodeURIComponent(iv.job.id)}`);
  const remove = async () => {
    if (!window.confirm('Delete this interview, its transcript and its report? This can\'t be undone.')) return;
    try {
      await api.interviews.remove(id);
      navigate('/app/live', { replace: true });
    } catch (e) {
      setError(e);
    }
  };

  if (error && !iv) {
    return (
      <EmptyCard>
        <Stack gap={12} align="flex-start">
          <span>{error.message}</span>
          <Button onClick={() => navigate('/app/live')}>Back to Live Interview</Button>
        </Stack>
      </EmptyCard>
    );
  }
  if (!iv) return <div role="status" style={{ padding: 24, color: '#8b93a1', fontSize: 14 }}>Loading the interview…</div>;

  const header = (
    <div style={{ fontSize: 13, color: '#5b6472' }}>{iv.job.title} at {iv.job.company} · {iv.resume.name}</div>
  );

  return (
    <Stack gap={16}>
      {error && (
        <div role="alert" style={{ background: '#fdecea', border: '1px solid #f6c9c4', color: '#8a2a22', borderRadius: 12, padding: '12px 14px', fontSize: 14 }}>{error.message}</div>
      )}

      {(iv.status === 'live' || iv.status === 'created') && (
        <Card pad={24} gap={14}>
          {header}
          <div style={{ fontSize: 18, fontWeight: 620 }}>{iv.status === 'live' ? 'This interview is still open' : "This interview hasn't started"}</div>
          <div style={{ fontSize: 14, color: '#4a5260', maxWidth: 560, lineHeight: 1.55 }}>
            {iv.status === 'live'
              ? 'Rejoin to carry on where you left off, or end it now to get a report from what you have answered so far.'
              : 'Join the room to begin. The interviewer will start with a short introduction.'}
          </div>
          <Row gap={10} wrap>
            <Button onClick={() => navigate(`/live/${id}`)}>{iv.status === 'live' ? 'Rejoin the interview' : 'Join the interview'}</Button>
            {iv.status === 'live' && <Button variant="outline" disabled={busy} onClick={() => act(() => api.interviews.end(id))}>End &amp; get report</Button>}
            <Button variant="outline" onClick={remove}>Delete</Button>
          </Row>
        </Card>
      )}

      {iv.status === 'ended' && waiting && (
        <Stack gap={12}>
          {header}
          <ProgressCard title="Writing your interview report…" steps={REPORT_STEPS} stepIdx={step} />
          <span style={{ fontSize: 13, color: '#5b6472' }}>This usually takes under a minute. You can leave this page: the report will be here when you come back.</span>
        </Stack>
      )}

      {iv.status === 'ended' && iv.reportStatus === 'failed' && (
        <Card pad={24} gap={12}>
          {header}
          <div style={{ fontSize: 18, fontWeight: 620 }}>The report couldn&apos;t be written</div>
          <div style={{ fontSize: 14, color: '#4a5260', maxWidth: 560, lineHeight: 1.55 }}>{iv.reportError || 'Something went wrong.'} Your transcript is saved, so nothing is lost.</div>
          <Row gap={10} wrap>
            <Button disabled={busy} onClick={() => act(() => api.interviews.retryReport(id))}>Try again</Button>
            <Button variant="outline" onClick={remove}>Delete</Button>
          </Row>
        </Card>
      )}

      {iv.status === 'ended' && iv.reportStatus === 'insufficient' && (
        <Card pad={24} gap={12}>
          {header}
          <div style={{ fontSize: 18, fontWeight: 620 }}>Too short to score</div>
          <div style={{ fontSize: 14, color: '#4a5260', maxWidth: 560, lineHeight: 1.55 }}>{iv.reportError}</div>
          <Row gap={10} wrap>
            <Button onClick={practice}>Start another interview</Button>
            <Button variant="outline" onClick={remove}>Delete</Button>
          </Row>
        </Card>
      )}

      {iv.status === 'ended' && iv.reportStatus === 'ready' && iv.report && <Report iv={iv} onPractice={practice} onDelete={remove} />}
    </Stack>
  );
}
