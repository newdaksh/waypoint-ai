// Microphone capture for the live interview (loaded by lib/liveAudio.js as an AudioWorklet).
//
// Turns whatever the audio hardware delivers (usually 44.1 or 48 kHz floats) into the format the interviewer
// expects: 16 kHz, mono, 16-bit little-endian PCM, in 40 ms frames. Each frame is posted to the page together
// with its loudness so the page can draw a level meter without analysing the audio again.
//
// This is a plain file in /public rather than a bundled module: the app's Content-Security-Policy only allows
// scripts from its own origin, which rules out blob: and data: URLs for worklets.

const TARGET_RATE = 16000;
const FRAME = 640; // samples per frame = 40 ms

class LiveCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / TARGET_RATE; // input samples per output sample (may be fractional, e.g. 2.76)
    this.sum = 0; // box filter: average the input samples that fall into one output sample
    this.count = 0;
    this.phase = 0;
    this.frame = new Int16Array(FRAME);
    this.filled = 0;
    this.energy = 0;
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input) return true;
    for (let i = 0; i < input.length; i += 1) {
      this.sum += input[i];
      this.count += 1;
      this.phase += 1;
      if (this.phase < this.ratio) continue;
      this.phase -= this.ratio;
      const v = Math.max(-1, Math.min(1, this.sum / this.count));
      this.sum = 0;
      this.count = 0;
      this.energy += v * v;
      this.frame[this.filled] = v < 0 ? v * 0x8000 : v * 0x7fff;
      this.filled += 1;
      if (this.filled === FRAME) {
        this.port.postMessage({ pcm: this.frame.buffer, rms: Math.sqrt(this.energy / FRAME) }, [this.frame.buffer]);
        this.frame = new Int16Array(FRAME);
        this.filled = 0;
        this.energy = 0;
      }
    }
    return true;
  }
}

registerProcessor('live-capture', LiveCapture);
