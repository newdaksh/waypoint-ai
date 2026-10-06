import { LIVE_DIFFICULTIES, LIVE_ROUNDS } from '@waypoint/shared';
import { connectLive } from '../ai/client.js';
import { HttpError } from '../errors.js';
import { buildSystemInstruction, CUE, interviewerName, LIVE_TOOLS, MIME_AUDIO_IN } from './prompt.js';

/**
 * One live interview, from the moment the browser connects until it ends. It sits between two connections:
 *
 *   browser ── WebSocket ──▶  LiveSession  ── Live API (Gemini) ──▶ the interviewer
 *
 * The browser never sees the API key, the system prompt, or the resume text: it only exchanges audio and a few
 * small control messages with this class. The class also owns everything that must survive a closed tab: the
 * transcript is written to the database as turns finish, and the clock and the time limit live here.
 *
 * Browser → server
 *   binary                 16 kHz mono 16-bit PCM microphone audio (dropped unless the interview is live)
 *   {type:'pause'|'resume'|'end'|'nudge'|'ping'}
 * Server → browser
 *   binary                 24 kHz mono 16-bit PCM audio of the interviewer
 *   {type:'status', state:'connecting'|'reconnecting'|'live'|'paused', elapsed}
 *   {type:'ready', elapsed, targetSec, maxSec, interviewer, resumed}
 *   {type:'transcript', id, role, text, final, interrupted?}   (same id = same turn growing)
 *   {type:'question', id, question, round, difficulty, followUp, derived?}
 *   {type:'interrupted'} · {type:'turn_complete'} · {type:'tick', elapsed} · {type:'concluding'}
 *   {type:'ended', reason}  ·  {type:'error', message, canRetry, fatal}  ·  {type:'pong'}
 */

const OPEN = 1; // WebSocket.OPEN
const MAX_TURN_CHARS = 6000;
const MIC_BYTES_PER_SECOND = 96_000; // real audio is 32,000; the rest is slack for bursts after a stall
const MAX_FRAME_BYTES = 32_768;
const SOCKET_BACKLOG_LIMIT = 2_000_000; // don't queue audio for a browser that has stopped reading
const NUDGE_EVERY_MS = 15_000;
const MAX_NUDGES = 5;
const HEARTBEAT_EVERY_MS = 15_000;
const TICK_SEND_EVERY_MS = 5_000;
const PAUSE_LIMIT_MS = 15 * 60 * 1000; // an interview left paused this long is over
const CONCLUDE_FAILSAFE_MS = 25_000; // the browser normally ends the interview itself once the goodbye has played
const RECONNECT_DELAYS_MS = [0, 1000, 2500];
const CUE_RETRIES = 2; // how often a note that should make the interviewer speak is resent if it doesn't

/** Strip artefacts the speech models sometimes emit and normalise whitespace. */
export const tidy = (text) => String(text ?? '').replace(/<ctrl\d+>|<noise>|\[noise\]/gi, '').replace(/\s+/g, ' ').trim();

/** The last question in what the interviewer said, used when the model didn't log one itself. */
export function lastQuestionIn(text) {
  const sentences = String(text).match(/[^.?!]+[.?!]*/g) || [];
  const question = sentences.map((s) => s.trim()).filter((s) => s.endsWith('?')).at(-1);
  return question && question.length >= 12 ? question.slice(0, 500) : '';
}

/** A logged question is shown on screen: keep just the question, not the greeting or comments around it. */
export function condenseQuestion(text) {
  const t = tidy(text);
  if (t.length <= 200) return t;
  return lastQuestionIn(t) || `${t.slice(0, 200).trimEnd()}…`;
}

const oneOf = (v, options) => (options.includes(v) ? v : '');

export class LiveSession {
  /**
   * @param socket    the browser's WebSocket (already authenticated, and the interview checked to be theirs)
   * @param interview the stored interview document
   * @param repo      interview repository
   * @param settings  { voice, targetSec, maxSec, tickMs }
   * @param hooks     { onFinish(doc, reason) when this session ended the interview, onClosed() when it is gone }
   */
  constructor({ socket, interview, repo, settings, hooks = {} }) {
    this.socket = socket;
    this.iv = interview;
    this.id = interview._id;
    this.repo = repo;
    this.settings = settings;
    this.hooks = hooks;

    this.transcript = [...(interview.transcript || [])]; // everything said so far (for rebuilding the context)
    // Ids continue after the highest stored one (turns that were empty never got stored, so counting them would collide).
    const highest = (list) => list.reduce((max, x) => Math.max(max, Number(String(x.id).slice(1)) || 0), 0);
    this.seq = highest(this.transcript);
    this.qSeq = highest(interview.questions || []);

    this.state = 'connecting'; // connecting | live | paused | reconnecting | closed
    this.closed = false;
    this.finishing = false;
    this.gen = 0; // identifies the current upstream connection, so a stale one's events are ignored
    this.up = null;
    this.handle = null; // Live API resumption handle: lets a dropped upstream connection continue the same conversation

    this.baseMs = (interview.activeSeconds || 0) * 1000; // interview time before this connection
    this.since = null; // when the clock last started running
    this.pausedAt = null;

    this.cand = null; // the candidate's turn being transcribed: { id, text }
    this.ai = null; // the interviewer's turn being spoken
    this.loggedQuestion = false; // did the interviewer log a question during its current turn?
    this.concluding = false;
    this.pendingCue = null; // a note that must be answered with speech: { text, tries, heard }
    this.cues = { warned: false, over: false };
    this.nudges = 0;
    this.lastNudge = 0;
    this.lastHeartbeat = 0;
    this.lastTickSent = 0;
    this.micBudget = MIC_BYTES_PER_SECOND;
    this.micBudgetAt = Date.now();
    this.chain = Promise.resolve(); // database writes, in order
    this.timers = new Set();
  }

  // ───────────────────────── plumbing

  send(message) {
    if (this.socket.readyState === OPEN) this.socket.send(JSON.stringify(message));
  }

  later(fn, ms) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    t.unref?.();
    this.timers.add(t);
    return t;
  }

  /** Queue a database write behind the previous ones (the transcript must be stored in order). */
  persist(fn) {
    this.chain = this.chain.then(fn).catch((err) => console.error('[live] could not save interview data:', err.message));
  }

  elapsedMs() {
    return this.baseMs + (this.since ? Date.now() - this.since : 0);
  }

  get elapsed() {
    return Math.floor(this.elapsedMs() / 1000);
  }

  startClock() {
    this.since ??= Date.now();
  }

  stopClock() {
    if (this.since) {
      this.baseMs += Date.now() - this.since;
      this.since = null;
    }
  }

  // ───────────────────────── lifecycle

  async start() {
    this.send({ type: 'status', state: 'connecting', elapsed: this.elapsed });
    try {
      await this.openUpstream({ withHandle: false });
    } catch (err) {
      return this.fail(err);
    }
    if (this.closed) return undefined;

    const resumed = this.transcript.length > 0;
    this.state = 'live';
    this.startClock();
    this.ticker = setInterval(() => this.tick(), this.settings.tickMs);
    this.ticker.unref?.();
    this.send({
      type: 'ready', elapsed: this.elapsed, targetSec: this.settings.targetSec, maxSec: this.settings.maxSec,
      interviewer: interviewerName(this.settings.voice), resumed,
    });
    this.cue(resumed ? CUE.rejoin : CUE.open);
    return undefined;
  }

  /** The browser went away without ending the interview: keep what was said and stop spending audio. */
  async detach() {
    if (this.closed) return;
    this.closed = true;
    this.state = 'closed';
    this.stopClock();
    this.finalizeCandidate();
    this.finalizeInterviewer({ interrupted: true });
    this.closeUpstream();
    this.clearTimers();
    this.persist(() => this.repo.heartbeat(this.id, this.elapsed));
    await this.chain;
    this.hooks.onClosed?.();
  }

  /** `finish` for callers that can't await it (timers, socket events): a failure is logged, never thrown. */
  end(reason) {
    return this.finish(reason).catch((err) => console.error('[live] could not finish interview:', err));
  }

  /** End the interview for good: store the result and hand over to report generation. */
  async finish(reason) {
    if (this.finishing || this.closed) return;
    this.finishing = true;
    this.stopClock();
    this.finalizeCandidate();
    this.finalizeInterviewer({ interrupted: true });
    this.closeUpstream();
    this.clearTimers();
    await this.chain;

    let doc = null;
    try {
      doc = await this.repo.end(this.id, { reason, activeSeconds: this.elapsed });
    } catch (err) {
      console.error('[live] could not end interview:', err.message);
    }
    this.closed = true;
    this.state = 'closed';
    this.send({ type: 'ended', reason });
    try {
      this.socket.close(1000, 'ended');
    } catch {
      /* already gone */
    }
    this.hooks.onClosed?.();
    if (doc) this.hooks.onFinish?.(doc, reason);
  }

  /** The same interview (or another one of this user's) was opened elsewhere: this connection steps aside. */
  async replace() {
    this.send({ type: 'error', message: 'This interview was opened in another window, so this one was closed.', canRetry: false, fatal: true, code: 'replaced' });
    await this.detach();
    try {
      this.socket.close(4001, 'replaced');
    } catch {
      /* already gone */
    }
  }

  /**
   * Tell the browser and close. The interview stays resumable if trying again could help; one that can never start
   * (wrong key, unknown model) and has nothing in it is ended at once instead of lingering as "in progress".
   */
  async fail(err) {
    const e = err instanceof HttpError ? err : new HttpError(502, "The interviewer couldn't be reached. Try again.");
    this.send({ type: 'error', message: e.message, canRetry: e.canRetry, fatal: true });
    const hopeless = !e.canRetry && !this.transcript.length;
    await this.detach();
    if (hopeless) await this.repo.end(this.id, { reason: 'error', activeSeconds: this.elapsed }).catch(() => {});
    try {
      this.socket.close(e.canRetry ? 1011 : 1008, 'unavailable');
    } catch {
      /* already gone */
    }
  }

  clearTimers() {
    clearInterval(this.ticker);
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  // ───────────────────────── upstream (Live API)

  liveConfig() {
    const { snapshot, job } = this.iv;
    return {
      responseModalities: ['AUDIO'],
      systemInstruction: buildSystemInstruction({
        snapshot,
        job,
        voice: this.settings.voice,
        targetMinutes: Math.max(1, Math.round(this.settings.targetSec / 60)),
        transcript: this.transcript,
      }),
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.settings.voice } } },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      // Interviewees think mid-answer: wait longer before deciding they are done, and don't let a cough interrupt.
      realtimeInputConfig: {
        automaticActivityDetection: { startOfSpeechSensitivity: 'START_SENSITIVITY_LOW', endOfSpeechSensitivity: 'END_SENSITIVITY_LOW', silenceDurationMs: 1000 },
      },
      sessionResumption: this.handle ? { handle: this.handle } : {},
      contextWindowCompression: { slidingWindow: {} }, // lets the session outlive the default audio length limit
      tools: LIVE_TOOLS,
    };
  }

  async openUpstream({ withHandle }) {
    const gen = ++this.gen;
    const saved = this.handle;
    if (!withHandle) this.handle = null;
    let up;
    try {
      up = await connectLive({
        config: this.liveConfig(),
        callbacks: {
          onmessage: (m) => gen === this.gen && this.onUpstreamMessage(m),
          onerror: (e) => gen === this.gen && console.warn('[live] upstream error:', e?.message || e),
          onclose: (e) => gen === this.gen && this.onUpstreamClosed(e).catch((err) => console.error('[live] reconnect failed:', err)),
        },
      });
    } catch (err) {
      this.handle = saved;
      throw err;
    }
    if (this.closed || this.finishing || gen !== this.gen) {
      up.close();
      return;
    }
    this.up = up;
  }

  closeUpstream() {
    this.gen += 1; // events from the connection being closed are no longer ours
    const up = this.up;
    this.up = null;
    try {
      up?.close();
    } catch {
      /* already closed */
    }
  }

  /** The Live API connection dropped (they last about ten minutes, or the network blinked): carry on seamlessly. */
  async onUpstreamClosed(e) {
    if (this.closed || this.finishing || this.state === 'reconnecting') return;
    console.warn(`[live] upstream closed (${e?.code} ${String(e?.reason || '').slice(0, 120)}); reconnecting`);
    const was = this.state;
    this.state = 'reconnecting';
    this.up = null;
    this.stopClock();
    this.finalizeCandidate();
    this.finalizeInterviewer({ interrupted: true });
    this.send({ type: 'status', state: 'reconnecting', elapsed: this.elapsed });

    let lastError = null;
    for (const [i, delay] of RECONNECT_DELAYS_MS.entries()) {
      if (delay) await new Promise((r) => this.later(r, delay));
      if (this.closed || this.finishing) return;
      // First try to continue the very same conversation; if the service refuses, rebuild it from our transcript.
      const withHandle = Boolean(this.handle) && i === 0;
      try {
        await this.openUpstream({ withHandle });
        if (this.closed || this.finishing) return;
        this.state = was === 'paused' ? 'paused' : 'live';
        if (this.state === 'live') this.startClock();
        this.send({ type: 'status', state: this.state, elapsed: this.elapsed });
        if (this.state === 'live' && !withHandle) this.cue(CUE.rejoin);
        return;
      } catch (err) {
        lastError = err;
        if (err instanceof HttpError && !err.canRetry) break;
      }
    }
    await this.fail(lastError);
  }

  /**
   * Deliver a note to the interviewer. `reply` makes it respond now; otherwise it only applies from the next answer.
   * The Live API now and then completes a turn without saying anything (the greeting would be lost, and the
   * candidate left waiting), so a note that must be answered is resent when its reply is empty or never comes.
   */
  cue(text, { reply = true } = {}) {
    this.deliver(text, reply);
    if (!reply) return;
    this.pendingCue = { text, tries: 0, heard: false };
    this.watchCue();
  }

  deliver(text, reply) {
    try {
      if (reply) this.up?.sendRealtimeInput({ text });
      else this.up?.sendClientContent({ turns: [{ role: 'user', parts: [{ text }] }], turnComplete: false });
    } catch (err) {
      console.warn('[live] could not send a control note:', err.message);
    }
  }

  watchCue() {
    clearTimeout(this.cueTimer);
    this.cueTimer = this.later(() => this.resendCue('no reply'), this.settings.cueTimeoutMs ?? 12_000);
  }

  resendCue(why) {
    const cue = this.pendingCue;
    if (!cue || cue.heard || this.closed || this.finishing || this.state !== 'live') return;
    if (cue.tries >= CUE_RETRIES) {
      this.pendingCue = null;
      return;
    }
    cue.tries += 1;
    console.warn(`[live] the interviewer didn't answer a control note (${why}); resending (${cue.tries}/${CUE_RETRIES})`);
    this.later(() => {
      if (this.pendingCue === cue && !cue.heard) {
        this.deliver(cue.text, true);
        this.watchCue();
      }
    }, 300);
  }

  /** The interviewer produced speech or text: any note waiting for an answer has got one. */
  heardInterviewer() {
    if (this.pendingCue) this.pendingCue.heard = true;
    clearTimeout(this.cueTimer);
  }

  // ───────────────────────── what the interviewer sends

  onUpstreamMessage(m) {
    if (this.closed || this.finishing) return;
    const upd = m.sessionResumptionUpdate;
    if (upd?.resumable && upd.newHandle) this.handle = upd.newHandle;
    if (m.toolCall) this.onToolCall(m.toolCall);

    const sc = m.serverContent;
    if (!sc) return;
    if (sc.interrupted) this.onInterrupted();
    if (sc.inputTranscription?.text) this.onCandidateText(sc.inputTranscription.text);
    if (sc.outputTranscription?.text) this.onInterviewerText(sc.outputTranscription.text);
    for (const part of sc.modelTurn?.parts || []) if (part.inlineData?.data) this.onAudio(part.inlineData.data);
    if (sc.turnComplete) this.onTurnComplete();
  }

  onAudio(base64) {
    this.heardInterviewer();
    this.finalizeCandidate(); // the interviewer is answering, so the candidate's turn is over
    if (this.state !== 'live' || this.socket.readyState !== OPEN || this.socket.bufferedAmount > SOCKET_BACKLOG_LIMIT) return;
    this.socket.send(Buffer.from(base64, 'base64'), { binary: true });
  }

  onCandidateText(text) {
    this.finalizeInterviewer({ interrupted: false });
    this.cand ??= { id: this.nextId(), text: '' };
    this.cand.text += text;
    this.sendPartial(this.cand, 'candidate');
  }

  onInterviewerText(text) {
    this.heardInterviewer();
    this.finalizeCandidate();
    if (!this.ai) {
      this.ai = { id: this.nextId(), text: '' };
      this.loggedQuestion = false;
    }
    this.ai.text += text;
    this.sendPartial(this.ai, 'interviewer');
  }

  onInterrupted() {
    this.finalizeInterviewer({ interrupted: true });
    this.concluding = false; // the candidate spoke over the goodbye: the interview isn't over yet
    this.send({ type: 'interrupted' });
  }

  onTurnComplete() {
    if (this.pendingCue && !this.pendingCue.heard) this.resendCue('empty turn');
    else this.pendingCue = null;
    this.finalizeInterviewer({ interrupted: false });
    this.send({ type: 'turn_complete' });
    if (this.concluding) {
      this.send({ type: 'concluding' });
      this.later(() => this.end('completed'), CONCLUDE_FAILSAFE_MS);
    }
  }

  onToolCall({ functionCalls = [] }) {
    const functionResponses = [];
    for (const call of functionCalls) {
      if (call.name === 'log_question') this.logQuestion(call.args || {});
      else if (call.name === 'end_interview') this.concluding = true;
      // SILENT: record the result without making the interviewer say anything about it.
      functionResponses.push({ id: call.id, name: call.name, response: { ok: true }, scheduling: 'SILENT' });
    }
    if (!functionResponses.length) return;
    try {
      this.up?.sendToolResponse({ functionResponses });
    } catch (err) {
      console.warn('[live] could not answer a tool call:', err.message);
    }
  }

  logQuestion(args, { derived = false } = {}) {
    const question = condenseQuestion(args.question);
    if (!question) return;
    this.loggedQuestion = true;
    const q = {
      id: `q${++this.qSeq}`,
      question,
      round: oneOf(args.round, LIVE_ROUNDS),
      difficulty: oneOf(args.difficulty, LIVE_DIFFICULTIES),
      followUp: args.followUp === true,
      t: this.elapsed,
      at: new Date().toISOString(),
    };
    this.persist(() => this.repo.addQuestion(this.id, q));
    this.send({ type: 'question', ...q, ...(derived ? { derived: true } : null) });
  }

  // ───────────────────────── transcript

  nextId() {
    return `t${++this.seq}`;
  }

  sendPartial(buf, role) {
    const text = tidy(buf.text);
    if (text) this.send({ type: 'transcript', id: buf.id, role, text, final: false });
  }

  /** Close a turn: store it, tell the browser it is final. Returns the stored turn (or null if it was empty). */
  finalize(buf, role, extra) {
    const text = tidy(buf?.text).slice(0, MAX_TURN_CHARS);
    if (!text) return null;
    const turn = { id: buf.id, role, text, at: new Date().toISOString(), t: this.elapsed, ...extra };
    this.transcript.push(turn);
    this.persist(() => this.repo.appendTurn(this.id, turn));
    this.send({ type: 'transcript', ...turn, final: true });
    return turn;
  }

  finalizeCandidate() {
    if (!this.cand) return;
    this.finalize(this.cand, 'candidate');
    this.cand = null;
  }

  finalizeInterviewer({ interrupted }) {
    if (!this.ai) return;
    const turn = this.finalize(this.ai, 'interviewer', interrupted ? { interrupted: true } : null);
    this.ai = null;
    // The model normally logs its questions itself; when it forgot, the question it asked is still worth showing.
    if (turn && !interrupted && !this.loggedQuestion) {
      const question = lastQuestionIn(turn.text);
      if (question) this.logQuestion({ question }, { derived: true });
    }
  }

  // ───────────────────────── what the browser sends

  onClientMessage(data, isBinary) {
    if (this.closed || this.finishing) return;
    if (isBinary) return this.onMic(data);

    let msg;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return undefined;
    }
    switch (msg?.type) {
      case 'pause': return this.pause();
      case 'resume': return this.resume();
      case 'end': return this.end('user');
      case 'nudge': return this.nudge();
      case 'ping': return this.send({ type: 'pong' });
      default: return undefined;
    }
  }

  onMic(buf) {
    if (this.state !== 'live' || !this.up || buf.length > MAX_FRAME_BYTES || buf.length % 2) return;
    // Real microphone audio is 32 kB/s; refuse a client that floods us (it would be billed audio).
    const now = Date.now();
    this.micBudget = Math.min(MIC_BYTES_PER_SECOND, this.micBudget + ((now - this.micBudgetAt) / 1000) * MIC_BYTES_PER_SECOND);
    this.micBudgetAt = now;
    if (this.micBudget < buf.length) return;
    this.micBudget -= buf.length;
    try {
      this.up.sendRealtimeInput({ audio: { data: Buffer.from(buf).toString('base64'), mimeType: MIME_AUDIO_IN } });
    } catch {
      /* the upstream connection is closing; its close event starts the reconnect */
    }
  }

  pause() {
    if (this.state !== 'live') return;
    this.state = 'paused';
    this.pausedAt = Date.now();
    this.stopClock();
    try {
      this.up?.sendRealtimeInput({ audioStreamEnd: true }); // flush what the candidate was saying
    } catch {
      /* closing */
    }
    this.persist(() => this.repo.heartbeat(this.id, this.elapsed));
    this.send({ type: 'status', state: 'paused', elapsed: this.elapsed });
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'live';
    this.pausedAt = null;
    this.startClock();
    this.send({ type: 'status', state: 'live', elapsed: this.elapsed });
    this.cue(CUE.back);
  }

  /** The browser noticed a long silence after a question: let the interviewer check in (rarely, never spammed). */
  nudge() {
    const now = Date.now();
    if (this.state !== 'live' || this.nudges >= MAX_NUDGES || now - this.lastNudge < NUDGE_EVERY_MS) return;
    this.nudges += 1;
    this.lastNudge = now;
    this.cue(CUE.silent);
  }

  // ───────────────────────── the clock

  tick() {
    if (this.closed || this.finishing) return;
    const now = Date.now();
    const { targetSec, maxSec } = this.settings;

    if (this.state === 'paused' && now - this.pausedAt > PAUSE_LIMIT_MS) {
      this.end('idle');
      return;
    }
    if (this.state !== 'live') return;

    const sec = this.elapsedMs() / 1000;
    if (sec >= maxSec) {
      this.end('time');
      return;
    }
    const left = targetSec - sec;
    if (!this.cues.over && left <= 0) {
      this.cues.over = true;
      this.cue(CUE.timeUp, { reply: false });
    } else if (!this.cues.warned && left > 0 && left <= Math.min(240, targetSec * 0.2)) {
      this.cues.warned = true;
      this.cue(CUE.minutesLeft(Math.max(1, Math.ceil(left / 60))), { reply: false });
    }

    if (now - this.lastTickSent >= TICK_SEND_EVERY_MS) {
      this.lastTickSent = now;
      this.send({ type: 'tick', elapsed: Math.floor(sec) });
    }
    if (now - this.lastHeartbeat >= HEARTBEAT_EVERY_MS) {
      this.lastHeartbeat = now;
      this.persist(() => this.repo.heartbeat(this.id, sec));
    }
  }
}
