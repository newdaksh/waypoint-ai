import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { openMicrophone, unsupportedReason, VoicePlayer } from '../lib/liveAudio.js';

// ~80 seconds of trying, then hand the decision back to the user.
const RECONNECT_DELAYS_MS = [400, 1000, 2000, 3000, 5000, 8000, 10_000, 10_000, 10_000, 10_000, 10_000, 10_000];
const PING_EVERY_MS = 10_000;
const DEAD_AFTER_MS = 30_000; // nothing at all from the server for this long: the connection is half-open
const SPEECH_ON = 0.03; // microphone loudness (0–1) that counts as the candidate speaking…
const SPEECH_STAY = 0.015; // …and the lower level that keeps it going within a word
const HANGOVER_MS = 900; // pauses between words and sentences shorter than this don't end the answer (matches the server's end-of-speech wait)
const MIN_ANSWER_MS = 600; // shorter than this is a cough, not an answer
const NUDGE_AFTER_MS = 25_000; // silence after a question before the interviewer checks in
const IDLE_DEBOUNCE_MS = 250; // gaps between audio chunks must not flicker the speaking state
const QUESTION_REVEAL_MS = 6000; // show a question this long after it was logged even if the voice is still going
const THINKING_MAX_MS = 15_000; // "thinking…" never lasts longer than this
const END_FALLBACK_MS = 6000; // if the server doesn't confirm the end, finish over REST

/**
 * Everything the interview room needs: the microphone, the interviewer's voice, the connection (with automatic
 * reconnection), the transcript, the clock and who is speaking. The room component only draws it.
 *
 * phase: idle → starting (microphone) → connecting → live ⇄ paused, reconnecting → ending → ended | failed
 */
export function useLiveInterview(id) {
  const [phase, setPhaseState] = useState('idle');
  const [error, setError] = useState(null); // { message, kind, canRetry, canEnd }
  const [notice, setNotice] = useState(''); // why we are reconnecting
  const [turns, setTurns] = useState([]);
  const [question, setQuestion] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [limits, setLimits] = useState(null);
  const [interviewer, setInterviewer] = useState('Your interviewer');
  const [speaker, setSpeaker] = useState('idle'); // ai | you | thinking | idle
  const [muted, setMutedState] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [endedReason, setEndedReason] = useState(null);

  // Mutable state that must be readable from callbacks without re-creating them.
  const r = useRef(null);
  r.current ??= {
    phase: 'idle', ws: null, mic: null, player: null, closing: false, ended: false, ending: false, starting: false, everReady: false,
    attempt: 0, retryTimer: 0, endTimer: 0, idleTimer: 0, questionTimer: 0, pingTimer: 0, tickTimer: 0,
    clock: { base: 0, since: null }, muted: false, micLevel: 0,
    userSpeaking: false, speechStart: 0, awaiting: false, aiSpeaking: false, aiStoppedAt: 0, lastLoud: 0, lastActivity: Date.now(), nudged: false,
    turnDone: false, concluding: false, pendingQuestion: null, lastMsgAt: 0, awaitingAt: 0,
  };
  const s = r.current;

  const setPhase = useCallback((p) => {
    s.phase = p;
    setPhaseState(p);
  }, [s]);

  // ───────────────────────── derived "who is speaking"
  const refreshSpeaker = useCallback(() => {
    const next = s.aiSpeaking ? 'ai' : s.userSpeaking ? 'you' : s.awaiting ? 'thinking' : 'idle';
    setSpeaker(next);
  }, [s]);

  // ───────────────────────── clock
  const syncClock = useCallback((seconds, running) => {
    s.clock = { base: seconds, since: running ? Date.now() : null };
    setElapsed(Math.floor(seconds));
  }, [s]);
  const clockSeconds = useCallback(() => s.clock.base + (s.clock.since ? (Date.now() - s.clock.since) / 1000 : 0), [s]);

  // ───────────────────────── teardown
  const teardown = useCallback(() => {
    s.closing = true;
    for (const k of ['retryTimer', 'endTimer', 'idleTimer', 'questionTimer']) clearTimeout(s[k]);
    const ws = s.ws;
    s.ws = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      try {
        ws.close(1000);
      } catch {
        /* already closed */
      }
    }
    s.mic?.close();
    s.mic = null;
    s.player?.close();
    s.player = null;
    s.userSpeaking = false;
    s.aiSpeaking = false;
    s.awaiting = false;
  }, [s]);

  const fail = useCallback((e) => {
    teardown();
    setError(e);
    setPhase('failed');
    setSpeaker('idle');
  }, [teardown, setPhase]);

  const finished = useCallback((reason) => {
    if (s.ended) return;
    s.ended = true;
    teardown();
    setEndedReason(reason || 'user');
    setPhase('ended');
    setSpeaker('idle');
  }, [s, teardown, setPhase]);

  // ───────────────────────── interviewer audio → speaking state
  const applyQuestion = useCallback(() => {
    clearTimeout(s.questionTimer);
    if (s.pendingQuestion) {
      setQuestion(s.pendingQuestion);
      s.pendingQuestion = null;
    }
  }, [s]);

  const maybeConclude = useCallback(() => {
    // The interviewer has said goodbye: once the farewell has played, close the interview.
    if (!s.concluding || s.aiSpeaking || s.ending || s.ended) return;
    clearTimeout(s.endTimer);
    s.endTimer = setTimeout(() => {
      if (!s.aiSpeaking) s.endRef?.();
    }, 1200);
  }, [s]);

  const onPlayerActive = useCallback(() => {
    clearTimeout(s.idleTimer);
    s.aiSpeaking = true;
    s.awaiting = false;
    s.nudged = false;
    refreshSpeaker();
  }, [s, refreshSpeaker]);

  const onPlayerIdle = useCallback(() => {
    clearTimeout(s.idleTimer);
    s.idleTimer = setTimeout(() => {
      if (s.player?.playing) return;
      s.aiSpeaking = false;
      s.aiStoppedAt = Date.now();
      s.lastActivity = Date.now();
      refreshSpeaker();
      applyQuestion();
      maybeConclude();
    }, IDLE_DEBOUNCE_MS);
  }, [s, refreshSpeaker, applyQuestion, maybeConclude]);

  // ───────────────────────── microphone
  const onFrame = useCallback((pcm, rms) => {
    s.micLevel = rms;
    const now = Date.now();
    const live = s.phase === 'live' && !s.muted;
    // Is the candidate speaking? Loudness with hysteresis, so breathing and room noise don't count, and a
    // hangover, so the gaps between words don't end the answer. The interviewer's own voice leaking into the
    // microphone is ignored while it is playing.
    if (live && !s.aiSpeaking && rms > (s.userSpeaking ? SPEECH_STAY : SPEECH_ON)) s.lastLoud = now;
    const speaking = live && now - s.lastLoud < HANGOVER_MS;
    if (speaking !== s.userSpeaking) {
      s.userSpeaking = speaking;
      if (speaking) {
        s.speechStart = now;
        s.awaiting = false;
      } else if (s.lastLoud - s.speechStart > MIN_ANSWER_MS && !s.aiSpeaking) {
        s.awaiting = true; // they finished an answer: the interviewer is thinking
        s.awaitingAt = now;
      }
      refreshSpeaker();
    }
    if (speaking) {
      s.lastActivity = now;
      s.nudged = false;
    }
    const ws = s.ws;
    if (live && ws && ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 256_000) ws.send(pcm);
  }, [s, refreshSpeaker]);

  // ───────────────────────── messages from the server
  const onMessage = useCallback((m) => {
    switch (m.type) {
      case 'ready':
        s.everReady = true;
        s.attempt = 0;
        s.turnDone = false;
        setNotice('');
        setError(null);
        if (m.interviewer) setInterviewer(m.interviewer);
        setLimits({ targetSec: m.targetSec, maxSec: m.maxSec });
        syncClock(m.elapsed, true);
        s.lastActivity = Date.now();
        setPhase('live');
        break;
      case 'status':
        if (m.elapsed != null) syncClock(m.elapsed, m.state === 'live');
        if (m.state === 'live' || m.state === 'paused' || m.state === 'reconnecting') {
          if (m.state === 'reconnecting') setNotice('Reconnecting to your interviewer…');
          else setNotice('');
          setPhase(m.state);
        }
        break;
      case 'tick':
        syncClock(m.elapsed, s.phase === 'live');
        break;
      case 'transcript':
        setTurns((prev) => {
          const i = prev.findIndex((t) => t.id === m.id);
          const turn = { id: m.id, role: m.role, text: m.text, final: m.final, interrupted: m.interrupted };
          if (i < 0) return [...prev, turn];
          const next = prev.slice();
          next[i] = turn;
          return next;
        });
        if (m.role === 'candidate' && m.final && !s.aiSpeaking) {
          s.awaiting = true;
          s.awaitingAt = Date.now();
          refreshSpeaker();
        }
        break;
      case 'question':
        s.pendingQuestion = { id: m.id, question: m.question, round: m.round, difficulty: m.difficulty, followUp: m.followUp };
        if (s.aiSpeaking) {
          clearTimeout(s.questionTimer);
          s.questionTimer = setTimeout(applyQuestion, QUESTION_REVEAL_MS); // otherwise shown when the voice stops
        } else applyQuestion();
        break;
      case 'interrupted':
        s.player?.flush();
        break;
      case 'turn_complete':
        s.turnDone = true;
        break;
      case 'concluding':
        s.concluding = true;
        maybeConclude();
        break;
      case 'ended':
        finished(m.reason);
        break;
      case 'error':
        if (m.fatal && (!m.canRetry || m.code === 'replaced')) {
          fail({ message: m.message, kind: m.code || 'server', canRetry: false });
        } else if (m.message) setNotice(m.message);
        break;
      default:
        break; // pong and anything newer than this client
    }
  }, [s, setPhase, syncClock, refreshSpeaker, applyQuestion, maybeConclude, finished, fail]);

  const onAudio = useCallback((buffer) => {
    if (s.phase === 'paused' || s.phase === 'ending') return;
    s.player?.enqueue(buffer);
  }, [s]);

  // ───────────────────────── connection
  const connectRef = useRef(null);

  const scheduleReconnect = useCallback(() => {
    if (s.closing || s.ended || s.ending) return;
    s.player?.flush();
    s.ws = null;
    if (s.attempt >= RECONNECT_DELAYS_MS.length) {
      fail({ message: "We couldn't reconnect. Your interview is saved: try again, or end it to get your report.", kind: 'network', canRetry: true, canEnd: true });
      return;
    }
    setPhase('reconnecting');
    setNotice((n) => n || 'Connection lost. Reconnecting…');
    s.userSpeaking = false;
    s.awaiting = false;
    refreshSpeaker();
    const delay = RECONNECT_DELAYS_MS[s.attempt];
    s.attempt += 1;
    s.retryTimer = setTimeout(async () => {
      try {
        // If the interview ended while we were away (time limit, ended elsewhere) there is nothing to rejoin.
        const { interview } = await api.interviews.get(id);
        if (interview.status === 'ended') {
          finished(interview.endReason);
          return;
        }
      } catch (e) {
        if (e.status === 404) {
          fail({ message: 'That interview no longer exists.', kind: 'missing', canRetry: false });
          return;
        }
        // Offline or a hiccup: just try the voice connection again.
      }
      connectRef.current?.();
    }, delay);
  }, [s, id, fail, finished, setPhase, refreshSpeaker]);

  const connect = useCallback(() => {
    if (s.closing || s.ended) return;
    clearTimeout(s.retryTimer);
    setPhase(s.everReady ? 'reconnecting' : 'connecting');
    let ws;
    try {
      ws = new WebSocket(api.liveSocketUrl(id));
    } catch {
      scheduleReconnect();
      return;
    }
    ws.binaryType = 'arraybuffer';
    s.ws = ws;
    s.lastMsgAt = Date.now();
    ws.onmessage = (e) => {
      if (s.ws !== ws) return;
      s.lastMsgAt = Date.now();
      if (typeof e.data === 'string') {
        try {
          onMessage(JSON.parse(e.data));
        } catch {
          /* ignore a malformed message */
        }
      } else onAudio(e.data);
    };
    ws.onclose = () => {
      if (s.ws !== ws) return;
      s.ws = null;
      if (!s.closing && !s.ended && !s.ending) scheduleReconnect();
      else if (s.ending && !s.ended) s.endRest?.(); // closed before confirming the end: make sure it ended
    };
    ws.onerror = () => {};
  }, [s, id, setPhase, onMessage, onAudio, scheduleReconnect]);
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  // ───────────────────────── actions
  const start = useCallback(async () => {
    if (s.starting || s.ws || s.ended || ['live', 'paused', 'connecting', 'reconnecting'].includes(s.phase)) return;
    const why = unsupportedReason();
    if (why) {
      fail({ message: why, kind: 'unsupported', canRetry: false });
      return;
    }
    s.starting = true;
    s.closing = false;
    s.attempt = 0;
    setError(null);
    setPhase('starting');
    try {
      if (!s.player) {
        s.player = new VoicePlayer({ onActive: onPlayerActive, onIdle: onPlayerIdle });
        await s.player.init();
        if (s.player.ctx) s.player.ctx.onstatechange = () => setNeedsTap(Boolean(s.player?.blocked));
        setNeedsTap(s.player.blocked);
      }
      s.mic ??= await openMicrophone({
        onFrame,
        onEnded: () => {
          if (!s.ended && !s.closing) fail({ message: 'Your microphone was disconnected. Reconnect it and try again.', kind: 'mic', canRetry: true });
        },
      });
    } catch (err) {
      s.starting = false;
      fail({ message: err.message, kind: err.kind || 'audio', canRetry: true });
      return;
    }
    s.starting = false;
    if (s.closing) return; // left the page while the microphone prompt was open
    connect();
  }, [s, fail, setPhase, onPlayerActive, onPlayerIdle, onFrame, connect]);

  const send = useCallback((message) => {
    const ws = s.ws;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  }, [s]);

  const pause = useCallback(() => {
    if (s.phase !== 'live') return;
    send({ type: 'pause' });
    s.player?.flush();
    s.userSpeaking = false;
    s.awaiting = false;
    syncClock(clockSeconds(), false);
    setPhase('paused');
    refreshSpeaker();
  }, [s, send, syncClock, clockSeconds, setPhase, refreshSpeaker]);

  const resume = useCallback(() => {
    if (s.phase !== 'paused') return;
    send({ type: 'resume' });
    syncClock(clockSeconds(), true);
    s.lastActivity = Date.now();
    setPhase('live');
  }, [s, send, syncClock, clockSeconds, setPhase]);

  const toggleMute = useCallback(() => {
    s.muted = !s.muted;
    setMutedState(s.muted);
    if (s.muted) {
      s.userSpeaking = false;
      refreshSpeaker();
    }
  }, [s, refreshSpeaker]);

  const endRest = useCallback(async () => {
    try {
      const { interview } = await api.interviews.end(id);
      finished(interview.endReason);
    } catch (e) {
      s.ending = false;
      setPhase('live');
      setError({ message: e.message || "The interview couldn't be ended. Try again.", kind: 'end', canRetry: true });
    }
  }, [s, id, finished, setPhase]);

  const end = useCallback(() => {
    if (s.ended || s.ending) return;
    s.ending = true;
    clearTimeout(s.endTimer);
    setPhase('ending');
    s.player?.flush();
    s.userSpeaking = false;
    s.awaiting = false;
    refreshSpeaker();
    const ws = s.ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'end' }));
      s.endTimer = setTimeout(() => endRest(), END_FALLBACK_MS); // the server normally answers within a moment
    } else endRest();
  }, [s, setPhase, refreshSpeaker, endRest]);
  useEffect(() => {
    s.endRest = endRest;
    s.endRef = end;
  }, [s, endRest, end]);

  const retry = useCallback(() => {
    teardown();
    s.closing = false;
    s.ending = false;
    s.ended = false;
    s.everReady = false;
    setError(null);
    setNotice('');
    setPhase('idle');
    start();
  }, [s, teardown, setPhase, start]);

  /** Show what the interview already holds (when rejoining): earlier turns, the last question, the clock. */
  const restore = useCallback((interview) => {
    setTurns((interview.transcript || []).map((t) => ({ id: t.id, role: t.role, text: t.text, final: true, interrupted: t.interrupted })));
    const q = interview.questions?.at(-1);
    if (q) setQuestion({ id: q.id, question: q.question, round: q.round, difficulty: q.difficulty, followUp: q.followUp });
    if (interview.limits) {
      setInterviewer(interview.limits.interviewer);
      setLimits({ targetSec: interview.limits.targetSec, maxSec: interview.limits.maxSec });
    }
    syncClock(interview.activeSeconds || 0, false);
  }, [syncClock]);

  const unlock = useCallback(async () => {
    await s.player?.unlock();
    setNeedsTap(Boolean(s.player?.blocked));
  }, [s]);

  // ───────────────────────── housekeeping
  useEffect(() => {
    // The clock on screen, and the checks that need a heartbeat: dead connections and long silences.
    s.tickTimer = setInterval(() => {
      setElapsed(Math.floor(clockSeconds()));
      const now = Date.now();
      if (s.awaiting && now - s.awaitingAt > THINKING_MAX_MS) {
        s.awaiting = false; // the interviewer didn't answer (the sound wasn't speech): stop saying it is thinking
        refreshSpeaker();
      }
      if (s.phase === 'live' && !s.muted && !s.aiSpeaking && !s.userSpeaking && s.turnDone && !s.nudged && now - s.lastActivity > NUDGE_AFTER_MS) {
        s.nudged = true;
        send({ type: 'nudge' });
      }
    }, 500);
    s.pingTimer = setInterval(() => {
      const ws = s.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (Date.now() - s.lastMsgAt > DEAD_AFTER_MS) {
        ws.close(); // half-open: the close handler starts a reconnect
        return;
      }
      ws.send(JSON.stringify({ type: 'ping' }));
    }, PING_EVERY_MS);
    return () => {
      clearInterval(s.tickTimer);
      clearInterval(s.pingTimer);
    };
  }, [s, clockSeconds, send, refreshSpeaker]);

  useEffect(() => {
    const online = () => {
      if (s.phase === 'reconnecting' && !s.ws) {
        clearTimeout(s.retryTimer);
        s.attempt = Math.min(s.attempt, 2);
        connect();
      }
    };
    const offline = () => {
      if (s.ws && s.phase !== 'ending') s.ws.close();
    };
    const leaving = (e) => {
      if (['live', 'paused', 'reconnecting'].includes(s.phase)) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    window.addEventListener('beforeunload', leaving);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      window.removeEventListener('beforeunload', leaving);
    };
  }, [s, connect]);

  // Leaving the room releases the microphone and the connection (the interview itself stays resumable).
  useEffect(() => () => teardown(), [teardown]);

  return {
    phase, error, notice, turns, question, elapsed, limits, interviewer, speaker, muted, needsTap, endedReason,
    start, pause, resume, end, retry, toggleMute, unlock, restore,
    /** Microphone loudness 0–1, read every animation frame by the level meters (no re-render). */
    getMicLevel: () => (s.muted || s.phase !== 'live' ? 0 : s.micLevel),
    getAiLevel: () => s.player?.level() ?? 0,
  };
}
