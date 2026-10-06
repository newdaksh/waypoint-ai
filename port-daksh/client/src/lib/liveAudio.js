// Browser audio for the live interview: the microphone going up, the interviewer's voice coming down.
// No dependency; everything here is the Web Audio API.

export const MIC_RATE = 16000; // what the server expects from the microphone
export const VOICE_RATE = 24000; // what the interviewer's voice arrives as

/** Can this browser run a live interview at all? Returns a user-facing reason when it can't. */
export function unsupportedReason() {
  if (typeof window === 'undefined') return null;
  if (!window.isSecureContext) return 'The microphone only works on a secure (HTTPS or localhost) page.';
  if (!navigator.mediaDevices?.getUserMedia) return "This browser can't access a microphone. Try a recent version of Chrome, Edge, Firefox or Safari.";
  if (!window.AudioContext && !window.webkitAudioContext) return "This browser can't play live audio. Try a recent version of Chrome, Edge, Firefox or Safari.";
  if (typeof AudioWorkletNode === 'undefined') return 'This browser is too old for live audio. Update it, or try Chrome, Edge, Firefox or Safari.';
  if (typeof WebSocket === 'undefined') return "This browser doesn't support live connections.";
  return null;
}

const Context = () => window.AudioContext || window.webkitAudioContext;

/** A readable message for why the microphone could not be opened. */
export function micErrorMessage(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Microphone access is blocked. Allow the microphone for this site in your browser (the icon in the address bar), then try again.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No microphone was found. Connect one and try again.';
    case 'NotReadableError':
    case 'AbortError':
      return 'Your microphone is in use by another app, or could not be started. Close the other app and try again.';
    default:
      return "The microphone couldn't be started. Check your browser's permissions and try again.";
  }
}

/**
 * Open the microphone and deliver 16 kHz mono PCM frames.
 *   onFrame(ArrayBuffer, rms)   a 40 ms frame of 16-bit samples, and how loud it was (0–1)
 *   onEnded()              the device went away (unplugged, permission revoked)
 * Resolves to { level(), close() }; rejects with an Error whose message is ready to show.
 */
export async function openMicrophone({ onFrame, onEnded }) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      // Echo cancellation matters: the interviewer's voice comes out of the same speakers the microphone hears.
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (err) {
    throw Object.assign(new Error(micErrorMessage(err)), { kind: 'mic', cause: err });
  }

  let ctx;
  try {
    ctx = new (Context())({ latencyHint: 'interactive' });
    await ctx.audioWorklet.addModule('/live-capture.worklet.js');
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});

    let rms = 0;
    const node = new AudioWorkletNode(ctx, 'live-capture', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    node.port.onmessage = (e) => {
      rms = e.data.rms;
      onFrame(e.data.pcm, e.data.rms);
    };
    // Browsers only run a node that leads to the output, so route it through a muted gain.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    ctx.createMediaStreamSource(stream).connect(node);
    node.connect(mute).connect(ctx.destination);

    const track = stream.getAudioTracks()[0];
    if (track) track.onended = () => onEnded?.();

    return {
      level: () => rms,
      close() {
        if (track) track.onended = null;
        node.port.onmessage = null;
        stream.getTracks().forEach((t) => t.stop());
        ctx.close().catch(() => {});
      },
    };
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    ctx?.close().catch(() => {});
    throw Object.assign(new Error("Live audio couldn't be started in this browser. Try Chrome, Edge, Firefox or Safari."), { kind: 'audio', cause: err });
  }
}

/**
 * Plays the interviewer's voice: 24 kHz mono 16-bit PCM chunks, queued back to back without gaps, and
 * stoppable at once when the candidate talks over the interviewer.
 */
export class VoicePlayer {
  constructor({ onActive, onIdle } = {}) {
    this.onActive = onActive;
    this.onIdle = onIdle;
    this.sources = new Set();
    this.next = 0; // when the next chunk should start (AudioContext time)
    this.ctx = null;
    this.buffer = null;
  }

  async init() {
    this.ctx = new (Context())({ latencyHint: 'interactive' });
    this.out = this.ctx.createGain();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.out.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    this.buffer = new Float32Array(this.analyser.fftSize);
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
  }

  /** Browsers keep audio suspended until the page has been interacted with; true means the user must tap. */
  get blocked() {
    return this.ctx?.state === 'suspended';
  }

  unlock() {
    return this.ctx?.resume().catch(() => {});
  }

  get playing() {
    return this.sources.size > 0;
  }

  /** Add a chunk of the interviewer's voice to the end of the queue. */
  enqueue(arrayBuffer) {
    if (!this.ctx || arrayBuffer.byteLength < 2) return;
    const pcm = new Int16Array(arrayBuffer, 0, arrayBuffer.byteLength >> 1);
    const samples = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i += 1) samples[i] = pcm[i] / 32768;
    const audio = this.ctx.createBuffer(1, samples.length, VOICE_RATE); // the browser resamples to the device rate
    audio.copyToChannel(samples, 0);

    const source = this.ctx.createBufferSource();
    source.buffer = audio;
    source.connect(this.out);
    // A small lead keeps the first chunk from being cut off; after a stall the queue restarts from "now".
    const at = Math.max(this.ctx.currentTime + 0.04, this.next);
    source.start(at);
    this.next = at + audio.duration;

    const wasIdle = this.sources.size === 0;
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      if (this.sources.size === 0) this.onIdle?.();
    };
    if (wasIdle) this.onActive?.();
  }

  /** Stop at once and forget everything queued (the candidate interrupted, or the interview was paused). */
  flush() {
    const had = this.sources.size > 0;
    for (const s of this.sources) {
      s.onended = null;
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources.clear();
    this.next = 0;
    if (had) this.onIdle?.();
  }

  /** Loudness of what is playing right now, 0–1 (for the avatar). */
  level() {
    if (!this.analyser || !this.sources.size) return 0;
    this.analyser.getFloatTimeDomainData(this.buffer);
    let sum = 0;
    for (let i = 0; i < this.buffer.length; i += 1) sum += this.buffer[i] * this.buffer[i];
    return Math.sqrt(sum / this.buffer.length);
  }

  close() {
    this.flush();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
