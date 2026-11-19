'use client';
/**
 * Participant audio engine (Web Audio API).
 *  - No <audio> element, so there is no player UI, seek bar, or scrubbing surface at all.
 *  - AudioBufferSourceNode.loop gives gapless looping.
 *  - The AudioContext is created and resumed synchronously inside the participant's "Next" click, which is the
 *    user gesture that satisfies browser autoplay policy.
 *  - "Started" is confirmed only when the audio clock is actually advancing, not merely because play() was called.
 */
export class AudioLoadError extends Error {
  constructor(public kind: 'load_error' | 'decode_error', message: string) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ExperimentAudio {
  readonly ctx: AudioContext;
  private gain: GainNode;
  private src: AudioBufferSourceNode | null = null;
  playing = false;
  interrupted = false;
  private stopped = false;

  private constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(ctx.destination);
    ctx.onstatechange = () => {
      if (this.playing && !this.stopped && ctx.state !== 'running') this.interrupted = true;
    };
    document.addEventListener('visibilitychange', () => {
      if (this.playing && !this.stopped && document.visibilityState === 'visible' && ctx.state !== 'running') {
        ctx.resume().catch(() => {});
      }
    });
  }

  /** MUST be called synchronously inside a click/tap handler. */
  static createInGesture(): ExperimentAudio | null {
    const AC: typeof AudioContext | undefined = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    ctx.resume().catch(() => {});
    // iOS/Safari unlock: play one silent sample inside the gesture.
    try {
      const b = ctx.createBuffer(1, 1, 22050);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);
    } catch {}
    return new ExperimentAudio(ctx);
  }

  get hasStarted() {
    return this.src !== null;
  }

  async load(url: string): Promise<AudioBuffer> {
    let ab: ArrayBuffer;
    try {
      const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      ab = await res.arrayBuffer();
    } catch (e: any) {
      throw new AudioLoadError('load_error', String(e?.message ?? e));
    }
    try {
      return await this.ctx.decodeAudioData(ab);
    } catch (e: any) {
      throw new AudioLoadError('decode_error', String(e?.message ?? e));
    }
  }

  /** Begin looping playback at the standardized volume (short ramp avoids a click). */
  start(buffer: AudioBuffer, volume: number) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(this.gain);
    const t = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setValueAtTime(0, t);
    this.gain.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, volume)), t + 0.05);
    src.start(t);
    this.src = src;
    this.playing = true;
  }

  /** Try to resume (call from a tap), then verify the audio clock really advances. */
  async confirmRunning(timeoutMs = 1500): Promise<boolean> {
    if (this.ctx.state !== 'running') {
      await Promise.race([this.ctx.resume().catch(() => {}), sleep(600)]);
    }
    if (this.ctx.state !== 'running') return false;
    const t0 = this.ctx.currentTime;
    const deadline = performance.now() + timeoutMs;
    while (performance.now() < deadline) {
      await sleep(60);
      if (this.ctx.currentTime - t0 > 0.1) return true;
    }
    return false;
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.playing = false;
    try {
      const t = this.ctx.currentTime;
      this.gain.gain.cancelScheduledValues(t);
      this.gain.gain.setValueAtTime(0, t);
      this.src?.stop();
      this.src?.disconnect();
    } catch {}
    this.ctx.close().catch(() => {});
  }
}
