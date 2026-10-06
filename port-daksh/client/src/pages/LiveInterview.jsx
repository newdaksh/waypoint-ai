import { activeResumeOf } from '@waypoint/shared';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import NoJob from '../components/NoJob.jsx';
import { Button, Card, EmptyCard, MonoLabel, Notice, Pill, Row, Spacer, Split, Stack } from '../components/ui.jsx';
import { activeJobOf } from '../lib/derive.js';
import { unsupportedReason } from '../lib/liveAudio.js';
import { pill, scoreColor } from '../lib/theme.js';
import { wordCount } from '../lib/resumeDoc.js';
import { useTasks } from '../state/TaskContext.jsx';
import { useWorkspace } from '../state/WorkspaceContext.jsx';

// The same minimums the server enforces (routes/interviews.js), so a card can say why it can't be picked.
const MIN_RESUME = 100;
const MIN_JOB = 150;

const when = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const minutes = (sec) => (sec < 60 ? `${Math.round(sec)} sec` : `${Math.round(sec / 60)} min`);

/** A radio-style choice: one card per resume / job, disabled with a reason when it can't be used. */
function Choice({ selected, disabled, onClick, title, meta, problem }) {
  return (
    <button type="button" className="pick" role="radio" aria-checked={selected} aria-pressed={selected} disabled={disabled} onClick={onClick} style={disabled ? { opacity: 0.6, cursor: 'default' } : undefined}>
      <Row gap={8} align="flex-start">
        <span className="lv-radio" data-on={selected ? '1' : '0'} aria-hidden="true" />
        <Stack gap={3} style={{ minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 14.5, fontWeight: 600, overflowWrap: 'anywhere' }}>{title}</span>
          <span style={{ fontSize: 12.5, color: '#5b6472', overflowWrap: 'anywhere' }}>{meta}</span>
          {problem && <span style={{ fontSize: 12.5, color: '#a8322a' }}>{problem}</span>}
        </Stack>
      </Row>
    </button>
  );
}

function History({ items, onOpen }) {
  const state = (i) => {
    if (i.status === 'live') return ['In progress', pill.amber];
    if (i.status === 'created') return ['Not started', pill.gray];
    if (i.reportStatus === 'ready') return [i.verdict, /hire$/i.test(i.verdict) && !/no hire/i.test(i.verdict) ? pill.green : pill.amber];
    if (i.reportStatus === 'insufficient') return ['Too short to score', pill.gray];
    if (i.reportStatus === 'failed') return ['Report failed', pill.red];
    return ['Writing report…', pill.blue];
  };
  return (
    <Stack gap={8}>
      {items.map((i) => {
        const [label, tone] = state(i);
        return (
          <button key={i.id} type="button" className="pick" onClick={() => onOpen(i.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <span className="mono" style={{ flex: 'none', width: 40, fontSize: 20, fontWeight: 650, color: i.overall != null ? scoreColor(i.overall) : '#c4c9d1', textAlign: 'center' }}>
              {i.overall ?? '—'}
            </span>
            <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
              <span style={{ fontSize: 14.5, fontWeight: 600, overflowWrap: 'anywhere' }}>{i.job.title} · {i.job.company}</span>
              <span style={{ fontSize: 12.5, color: '#5b6472', overflowWrap: 'anywhere' }}>{when(i.startedAt || i.createdAt)} · {i.activeSeconds ? minutes(i.activeSeconds) : 'no time recorded'} · {i.resume.name}</span>
            </Stack>
            <Pill small tone={tone}>{label}</Pill>
          </button>
        );
      })}
    </Stack>
  );
}

export default function LiveInterview() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { ws } = useWorkspace();
  const tasks = useTasks();
  const [history, setHistory] = useState(null);
  const [historyError, setHistoryError] = useState(null);
  const [limits, setLimits] = useState(null);

  const usable = (list, min, key) => list.filter((x) => String(x[key] || '').trim().length >= min);
  const resumes = ws.resumes;
  const jobs = ws.jobs;
  const pick = (wanted, list, min, key, fallback) => {
    const ok = usable(list, min, key);
    return ok.find((x) => x.id === wanted)?.id || ok.find((x) => x.id === fallback)?.id || ok[0]?.id || '';
  };
  // Start from what the user is already working with (or the pair a "practice again" link names): usually one click.
  const [resumeId, setResumeId] = useState(() => pick(params.get('resume'), resumes, MIN_RESUME, 'text', activeResumeOf(ws)?.id));
  const [jobId, setJobId] = useState(() => pick(params.get('job'), jobs, MIN_JOB, 'text', activeJobOf(ws)?.id));

  useEffect(() => {
    let off = false;
    api.interviews.list().then(
      (r) => {
        if (off) return;
        setHistory(r.interviews);
        setLimits(r.limits);
      },
      (e) => !off && setHistoryError(e),
    );
    return () => {
      off = true;
    };
  }, []);

  const unsupported = unsupportedReason();
  const resume = resumes.find((r) => r.id === resumeId);
  const job = jobs.find((j) => j.id === jobId);
  const open = history?.find((i) => i.status === 'live');
  const ready = Boolean(resume && job) && !unsupported;
  const targetMin = limits ? Math.round(limits.targetSec / 60) : 20;

  const start = async () => {
    let created = null;
    const ok = await tasks.run(
      'Preparing your interview…',
      ['Reading your resume', 'Reading the job description', 'Briefing your interviewer'],
      async () => {
        created = (await api.interviews.create({ resumeId, jobId })).interview;
      },
    );
    if (ok && created) navigate(`/live/${created.id}`);
  };

  if (!jobs.length) return <NoJob tool="The live interview" />;
  if (!usable(resumes, MIN_RESUME, 'text').length) {
    return (
      <EmptyCard>
        <Stack gap={12} align="flex-start">
          <span>The interviewer builds its questions from your resume. Add your resume text first.</span>
          <Button onClick={() => navigate('/app/resumes')}>Go to Resumes</Button>
        </Stack>
      </EmptyCard>
    );
  }

  return (
    <Stack gap={18}>
      {open && (
        <Card accent pad="16px 20px">
          <Row gap={12} wrap>
            <Stack gap={2} style={{ flex: 1, minWidth: 240 }}>
              <span style={{ fontWeight: 600, fontSize: 14.5 }}>You have an interview in progress</span>
              <span style={{ fontSize: 13, color: '#5b6472' }}>{open.job.title} at {open.job.company}. Rejoin to carry on, or end it to get a report.</span>
            </Stack>
            <Button onClick={() => navigate(`/live/${open.id}`)}>Rejoin</Button>
            <Button variant="outline" onClick={() => navigate(`/app/live/${open.id}`)}>Details</Button>
          </Row>
        </Card>
      )}

      <Card pad={24} gap={20}>
        <Row gap={14} align="flex-start" wrap>
          <Stack gap={4} style={{ flex: 1, minWidth: 260 }}>
            <span style={{ fontSize: 20, fontWeight: 620, letterSpacing: '-.02em' }}>Practise with a live voice interview</span>
            <span style={{ fontSize: 14, color: '#4a5260', lineHeight: 1.55, maxWidth: 640 }}>
              An AI interviewer talks with you in real time, about {targetMin} minutes, built from the resume and job you choose. It asks about your
              experience, tests the skills the job needs, follows up on vague answers and adapts to how you do. Afterwards you get a scored report.
            </span>
          </Stack>
        </Row>

        <Split cols="minmax(0,1fr) minmax(0,1fr)" align="start">
          <Stack gap={10} role="radiogroup" aria-label="Choose a resume">
            <MonoLabel>1 · Choose a resume</MonoLabel>
            {resumes.map((r) => {
              const short = r.text.trim().length < MIN_RESUME;
              return (
                <Choice
                  key={r.id}
                  selected={r.id === resumeId}
                  disabled={short}
                  onClick={() => setResumeId(r.id)}
                  title={r.name}
                  meta={short ? 'No text yet' : `${wordCount(r.text).toLocaleString('en-US')} words${r.note ? ` · ${r.note}` : ''}`}
                  problem={short ? 'Add the resume text under Resumes to use it.' : null}
                />
              );
            })}
          </Stack>
          <Stack gap={10} role="radiogroup" aria-label="Choose a target job">
            <MonoLabel>2 · Choose a target job</MonoLabel>
            {jobs.map((j) => {
              const short = String(j.text || '').trim().length < MIN_JOB;
              return (
                <Choice
                  key={j.id}
                  selected={j.id === jobId}
                  disabled={short}
                  onClick={() => setJobId(j.id)}
                  title={j.title}
                  meta={[j.company, j.location].filter(Boolean).join(' · ')}
                  problem={short ? 'Paste a fuller job description under Target jobs to use it.' : null}
                />
              );
            })}
          </Stack>
        </Split>

        {unsupported && <Notice>{unsupported}</Notice>}

        <Row gap={14} wrap>
          <Button size="lg" onClick={start} disabled={!ready || Boolean(tasks.loading)} style={{ opacity: ready ? 1 : 0.5 }}>Start Live Interview</Button>
          <span style={{ fontSize: 13, color: '#5b6472', flex: 1, minWidth: 240, lineHeight: 1.5 }}>
            {ready ? (
              <>3 · Your browser will ask to use the microphone. Find a quiet place; headphones help.</>
            ) : (
              'Choose a resume and a job to begin.'
            )}
          </span>
        </Row>
      </Card>

      <Stack gap={10}>
        <Row gap={10}>
          <span style={{ fontSize: 17, fontWeight: 620 }}>Your interviews</span>
          <Spacer />
        </Row>
        {historyError && <Notice>{historyError.message}</Notice>}
        {!historyError && history === null && <div role="status" style={{ fontSize: 13.5, color: '#8b93a1' }}>Loading…</div>}
        {history?.length === 0 && <EmptyCard>No interviews yet. Your first one will appear here with its score.</EmptyCard>}
        {history?.length > 0 && <History items={history} onOpen={(id) => navigate(`/app/live/${id}`)} />}
      </Stack>
    </Stack>
  );
}
