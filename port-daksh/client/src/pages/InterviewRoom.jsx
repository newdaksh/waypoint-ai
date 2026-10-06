import { LIVE_ROUNDS } from '@waypoint/shared';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { Avatar, MicMeter } from '../components/LiveMeters.jsx';
import { Button, Pill, Row, Stack } from '../components/ui.jsx';
import { Spinner } from '../components/icons.jsx';
import { difficultyTone, pill } from '../lib/theme.js';
import { useLiveInterview } from '../state/useLiveInterview.js';

const clock = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

const CONNECTION = {
  idle: ['Connecting', 'warn'],
  starting: ['Starting microphone', 'warn'],
  connecting: ['Connecting', 'warn'],
  live: ['Connected', 'good'],
  paused: ['Paused', 'idle'],
  reconnecting: ['Reconnecting', 'warn'],
  ending: ['Wrapping up', 'idle'],
  failed: ['Disconnected', 'bad'],
  ended: ['Finished', 'idle'],
};

function Mic({ on }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
      {!on && <path d="M4 4l16 16" />}
    </svg>
  );
}

/** The rounds as a progress strip: finished, current, still to come. */
function Rounds({ current }) {
  const at = LIVE_ROUNDS.indexOf(current);
  return (
    <ol className="lv-rounds" aria-label="Interview rounds">
      {LIVE_ROUNDS.map((round, i) => (
        <li key={round} data-state={at < 0 ? (i === 0 ? 'current' : 'todo') : i < at ? 'done' : i === at ? 'current' : 'todo'} aria-current={i === at ? 'step' : undefined}>
          {round}
        </li>
      ))}
    </ol>
  );
}

function Message({ turn, interviewer }) {
  const you = turn.role === 'candidate';
  return (
    <div className={`lv-msg${you ? ' lv-msg--you' : ''}${turn.final ? '' : ' lv-msg--live'}`}>
      <div className="lv-msg__who">{you ? 'You' : interviewer}{turn.interrupted ? ' · cut off' : ''}</div>
      <div className="lv-msg__bubble">{turn.text}</div>
    </div>
  );
}

function Transcript({ turns, interviewer, speaker, paused }) {
  const box = useRef(null);
  const stick = useRef(true); // follow the conversation unless the reader scrolled up
  const last = turns.at(-1);
  // While the candidate is speaking, the transcript of what they say only arrives once they stop.
  const speakingNow = speaker === 'you' && !paused && !(last && last.role === 'candidate' && !last.final);

  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [turns, speakingNow]);

  return (
    <section className="lv-card lv-transcript" aria-label="Live transcript">
      <header className="lv-card__head">
        <span className="mono-label">Live transcript</span>
        <span className="lv-card__hint">{turns.length ? `${turns.length} turn${turns.length > 1 ? 's' : ''}` : 'Starts when the interview does'}</span>
      </header>
      <div
        ref={box}
        className="lv-transcript__scroll"
        role="log"
        aria-live="off"
        tabIndex={0}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
      >
        {!turns.length && !speakingNow && <p className="lv-empty">The conversation will appear here as you talk. It is saved with your report.</p>}
        {turns.map((t) => <Message key={t.id} turn={t} interviewer={interviewer} />)}
        {speakingNow && (
          <div className="lv-msg lv-msg--you lv-msg--live">
            <div className="lv-msg__who">You</div>
            <div className="lv-msg__bubble lv-msg__bubble--ghost">Speaking…</div>
          </div>
        )}
      </div>
    </section>
  );
}

function Modal({ title, children, actions, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.querySelector('[data-autofocus]')?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="lv-modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={ref} className="lv-modal__box" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <div className="lv-modal__body">{children}</div>
        <Row gap={10} justify="flex-end" wrap>{actions}</Row>
      </div>
    </div>
  );
}

function FailureCard({ error, onRetry, onEnd, onLeave }) {
  return (
    <div className="lv-center">
      <div className="lv-card lv-gate" role="alert">
        <div className="lv-gate__icon lv-gate__icon--bad" aria-hidden="true">!</div>
        <h2>{error.kind === 'mic' ? "We can't hear you yet" : error.kind === 'replaced' ? 'Interview open elsewhere' : "The interview couldn't continue"}</h2>
        <p>{error.message}</p>
        <Row gap={10} wrap justify="center">
          {error.canRetry && <Button onClick={onRetry}>Try again</Button>}
          {error.canEnd && <Button variant="outline" onClick={onEnd}>End &amp; get report</Button>}
          <Button variant="outline" onClick={onLeave}>Back to Live Interview</Button>
        </Row>
      </div>
    </div>
  );
}

/** Full-screen, distraction-free interview room. The page only draws; useLiveInterview does the work. */
export default function InterviewRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const live = useLiveInterview(id);
  const { phase, speaker, turns, question, interviewer, limits, elapsed, muted, restore } = live;
  const [meta, setMeta] = useState(null); // the interview as stored: job, resume
  const [loadError, setLoadError] = useState(null);
  const [gate, setGate] = useState(false); // the browser wants a click before it allows audio
  const [confirmEnd, setConfirmEnd] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0); // arriving from the setup page, which may have been scrolled
  }, []);

  // What this interview is for.
  useEffect(() => {
    let off = false;
    api.interviews.get(id).then(
      ({ interview }) => {
        if (off) return;
        if (interview.status === 'ended') {
          navigate(`/app/live/${id}`, { replace: true });
          return;
        }
        restore(interview); // rejoining shows what was already said
        setMeta(interview);
      },
      (e) => !off && setLoadError(e),
    );
    return () => {
      off = true;
    };
  }, [id, navigate, restore]);

  // Join automatically after the click that opened this page. A reloaded page has had no click yet: ask for one.
  const { start } = live;
  useEffect(() => {
    if (!meta) return undefined;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) {
      setGate(true);
      return undefined;
    }
    const t = setTimeout(start, 60); // not at once, so React's development double-mount doesn't open the microphone twice
    return () => clearTimeout(t);
  }, [meta, start]);

  useEffect(() => {
    if (phase === 'ended') navigate(`/app/live/${id}`, { replace: true });
  }, [phase, id, navigate]);

  const leave = () => navigate('/app/live');
  const paused = phase === 'paused';
  const running = phase === 'live' || paused;
  const [connLabel, connTone] = gate && phase === 'idle' ? ['Ready to join', 'idle'] : CONNECTION[phase] || CONNECTION.idle;
  const named = interviewer !== 'Your interviewer';
  const target = limits?.targetSec || 1200;
  const over = elapsed >= target;
  // Before the interviewer has said anything the candidate must not be told it is their turn.
  const joining = phase === 'live' && !paused && speaker === 'idle' && !turns.length && !question;
  const status =
    phase === 'ending' ? 'Wrapping up…'
    : paused ? 'Paused'
    : phase === 'reconnecting' ? 'Reconnecting…'
    : !running ? 'Getting ready…'
    : joining ? `${interviewer} is joining…`
    : speaker === 'ai' ? `${interviewer} is speaking`
    : speaker === 'you' ? 'Listening to you'
    : speaker === 'thinking' ? `${interviewer} is thinking`
    : 'Your turn — go ahead';

  if (loadError) {
    return (
      <div className="lv-room">
        <FailureCard error={{ message: loadError.message, kind: 'missing', canRetry: false }} onLeave={leave} />
      </div>
    );
  }

  return (
    <div className="lv-room">
      <header className="lv-top">
        <button className="lv-brand" onClick={leave} aria-label="Leave the room and go back to Live Interview">
          <span className="lv-brand__mark"><i /></span>
        </button>
        <div className="lv-top__title">
          <strong>{meta ? meta.job.title : 'Live interview'}</strong>
          <span>{meta ? `${meta.job.company} · ${meta.resume.name}` : 'Preparing your interview…'}</span>
        </div>
        <div className="lv-top__right">
          <div className="lv-timer" role="timer" aria-label={`Interview time ${clock(elapsed)}`}>
            <span className="lv-timer__time">{clock(elapsed)}</span>
            <span className="lv-timer__of">{over ? 'wrapping up' : `of ~${Math.round(target / 60)} min`}</span>
            <span className="lv-timer__bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (elapsed / target) * 100)}%` }} /></span>
          </div>
          <span className="lv-conn" data-tone={connTone} role="status"><i aria-hidden="true" />{connLabel}</span>
        </div>
      </header>

      {live.phase === 'failed' && live.error ? (
        <FailureCard
          error={live.error}
          onRetry={live.retry}
          onEnd={live.end}
          onLeave={leave}
        />
      ) : gate && phase === 'idle' ? (
        <div className="lv-center">
          <div className="lv-card lv-gate">
            <Avatar name={named ? interviewer : ''} speaker="idle" getLevel={() => 0} />
            <h2>Ready when you are</h2>
            <p>
              {meta?.job.title} at {meta?.job.company}. You will talk with an AI interviewer using your microphone, so find a quiet
              spot. Headphones help the interviewer hear only you.
            </p>
            <Button size="lg" onClick={() => { setGate(false); start(); }}>Join the interview</Button>
          </div>
        </div>
      ) : (
        <main className="lv-body">
          <div className="lv-stage">
            <section className="lv-card lv-interviewer" data-paused={paused ? '1' : '0'} aria-label="Interviewer">
              <Avatar name={named ? interviewer : ''} speaker={speaker} paused={paused || phase === 'reconnecting'} getLevel={live.getAiLevel} />
              <div className="lv-interviewer__name">{interviewer}</div>
              <div className="lv-interviewer__role">AI interviewer</div>
              <div className="lv-status" role="status" aria-live="polite" data-speaker={paused ? 'paused' : speaker}>
                {(phase === 'live' && speaker === 'thinking') || phase === 'ending' || joining ? <Spinner size={14} /> : <i aria-hidden="true" />}
                {status}
              </div>
              {phase === 'reconnecting' && <div className="lv-note">{live.notice || 'Connection lost. Reconnecting…'} Your interview is saved.</div>}
              {paused && (
                <div className="lv-pause" role="group" aria-label="Interview paused">
                  <strong>Interview paused</strong>
                  <span>The clock is stopped and the microphone is off.</span>
                  <Button onClick={live.resume}>Resume interview</Button>
                </div>
              )}
            </section>

            <section className="lv-card lv-question" aria-label="Current question">
              <header className="lv-card__head">
                <span className="mono-label">Current question</span>
                {question && (
                  <Row gap={6}>
                    {question.round && <Pill tone={pill.blue} small>{question.round}</Pill>}
                    {question.difficulty && <Pill tone={difficultyTone[question.difficulty] || pill.gray} small>{question.difficulty}</Pill>}
                    {question.followUp && <Pill tone={pill.violet} small>Follow-up</Pill>}
                  </Row>
                )}
              </header>
              <p className={`lv-question__text${question ? '' : ' lv-question__text--empty'}`}>
                {question ? question.question : 'Your interviewer will start with a short introduction, then the first question appears here.'}
              </p>
              <Rounds current={question?.round} />
            </section>

            <section className="lv-card lv-you" aria-label="Your microphone">
              <div className="lv-you__icon" data-state={muted ? 'muted' : phase === 'live' ? 'on' : 'off'}><Mic on={!muted && phase === 'live'} /></div>
              <div className="lv-you__main">
                <div className="lv-you__label">
                  {muted ? 'Microphone muted' : paused ? 'Microphone off while paused' : phase === 'live' ? (speaker === 'you' ? 'Hearing you' : 'Microphone on') : 'Microphone not connected yet'}
                </div>
                <MicMeter getLevel={live.getMicLevel} live={phase === 'live' && !muted} />
              </div>
              <span className="lv-you__tip">Use headphones to avoid echo</span>
            </section>

            <div className="lv-controls" role="group" aria-label="Interview controls">
              <Button variant="outline" onClick={live.toggleMute} disabled={!running || paused} aria-pressed={muted}>{muted ? 'Unmute' : 'Mute'}</Button>
              {paused
                ? <Button variant="outline" onClick={live.resume}>Resume</Button>
                : <Button variant="outline" onClick={live.pause} disabled={phase !== 'live'}>Pause</Button>}
              <Button className="lv-end" onClick={() => setConfirmEnd(true)} disabled={phase === 'ending' || phase === 'idle' || phase === 'starting'}>End interview</Button>
            </div>
          </div>

          <Transcript turns={turns} interviewer={interviewer} speaker={speaker} paused={paused} />
        </main>
      )}

      {live.needsTap && !gate && (
        <div className="lv-tap" role="alert">
          <span>Your browser is holding back audio.</span>
          <Button size="sm" onClick={live.unlock}>Enable sound</Button>
        </div>
      )}

      {live.error && phase !== 'failed' && (
        <div className="lv-tap lv-tap--bad" role="alert"><span>{live.error.message}</span></div>
      )}

      {phase === 'ending' && (
        <div className="lv-modal" role="alert" aria-live="assertive">
          <div className="lv-modal__box lv-modal__box--center">
            <Spinner size={26} />
            <h2>Wrapping up</h2>
            <p>Saving your interview. Your report will be ready in a moment.</p>
          </div>
        </div>
      )}

      {confirmEnd && (
        <Modal
          title="End the interview?"
          onClose={() => setConfirmEnd(false)}
          actions={(
            <>
              <Button variant="outline" onClick={() => setConfirmEnd(false)} data-autofocus>Keep going</Button>
              <Button className="lv-end" onClick={() => { setConfirmEnd(false); live.end(); }}>End &amp; get report</Button>
            </>
          )}
        >
          <Stack gap={8}>
            <span>You can&apos;t resume it afterwards. Your answers so far will be scored and you&apos;ll get a full report.</span>
            {elapsed < 90 && <span style={{ color: '#8a5a12' }}>Very short interviews can&apos;t be scored: answer a few questions first for a useful report.</span>}
          </Stack>
        </Modal>
      )}
    </div>
  );
}
