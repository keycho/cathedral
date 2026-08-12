// cathedral - sound, fully synthesized (no assets). three voices: the thud
// of stone landing, the rumble of collapse and subsidence, the deep toll of
// a monument. the context unlocks on the first user gesture per browser
// autoplay policy; everything before that is silence. callers pass a gain
// (0..1) they have already attenuated by distance.

const THUD_MIN_GAP = 70; // ms between thuds (a storm is a drumroll, not noise)

class WorldAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private lastThud = 0;
  // the heartbeat: a felt low lub-dub whose rate is the market's tx rate
  private bpm = 0;
  private nextBeat = 0;

  constructor() {
    const unlock = () => {
      this.ensure();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
  }

  private ensure() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      // one shared noise buffer (1s of white noise)
      const n = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, n, n);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  private noise(duration: number, filterHz: number, gain: number, decay: number) {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = filterHz;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + duration);
  }

  private tone(freq: number, gain: number, decay: number, drop = 0, delaySec = 0) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delaySec;
    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(freq, t);
    if (drop > 0) o.frequency.exponentialRampToValueAtTime(Math.max(24, freq - drop), t + decay);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + decay + 0.05);
  }

  // a block landing. vol is pre-attenuated by the caller.
  thud(vol: number) {
    if (!this.ctx || vol <= 0.02) return;
    const now = performance.now();
    if (now - this.lastThud < THUD_MIN_GAP) return;
    this.lastThud = now;
    const v = Math.min(1, vol);
    this.noise(0.09, 420, 0.5 * v, 0.09);
    this.tone(88 + Math.random() * 26, 0.5 * v, 0.16, 40);
  }

  // collapse, subsidence, a storm front: a low swell
  rumble(vol: number) {
    if (!this.ctx) return;
    const v = Math.min(1, vol);
    this.noise(1.7, 130, 0.55 * v, 1.7);
    this.tone(46, 0.4 * v, 1.5, 14);
  }

  // the world's pulse rate; 0 silences it
  setPulse(bpm: number) {
    this.bpm = Math.max(0, Math.min(120, bpm));
  }

  // called every frame: schedules the next beat when due. very quiet - it
  // should be felt under everything, not heard over anything.
  update(now: number) {
    if (!this.ctx || this.bpm <= 0) return;
    if (now < this.nextBeat) return;
    const period = 60_000 / this.bpm;
    // resync after a stall (tab hidden) instead of drumrolling to catch up
    this.nextBeat = now - this.nextBeat > 2_000 ? now + period : this.nextBeat + period;
    this.tone(50, 0.085, 0.16, 12);
    this.tone(42, 0.06, 0.14, 8, 0.15); // the dub trails the lub
  }

  // the monument slam (and one day the bell): a deep toll
  toll(vol: number) {
    if (!this.ctx) return;
    const v = Math.min(1, vol);
    this.noise(0.06, 900, 0.3 * v, 0.06);
    this.tone(55, 0.5 * v, 2.8, 0);
    this.tone(82.5, 0.3 * v, 2.2, 0);
    this.tone(110, 0.22 * v, 1.7, 0);
  }
}

export const audio = new WorldAudio();
