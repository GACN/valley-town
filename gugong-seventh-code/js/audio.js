// audio.js —— 全程序化音效（无外部素材）：雨、风、脚步、钟、UI
export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.rainGain = null;
    this.windGain = null;
    this.weather = 'clear';
  }

  init() {
    if (this.ctx) return;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    this.ctx = new C();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    this._makeNoise();
    this._rain(); this._wind(); this._drone();
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  _makeNoise() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
  }

  _rain() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7200;
    this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0;
    src.connect(hp).connect(lp).connect(this.rainGain).connect(this.master);
    src.start();
  }

  _wind() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 320; bp.Q.value = 0.7;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0.05;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08;
    const lg = ctx.createGain(); lg.gain.value = 0.035;
    lfo.connect(lg).connect(this.windGain.gain);
    src.connect(bp).connect(this.windGain).connect(this.master);
    src.start(); lfo.start();
  }

  _drone() {
    const ctx = this.ctx;
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 55;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 82.4;
    const g = ctx.createGain(); g.gain.value = 0.05;
    o1.connect(g); o2.connect(g); g.connect(this.master);
    o1.start(); o2.start();
  }

  setWeather(w) {
    this.weather = w;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const r = w === 'rain' ? 0.22 : 0;
    this.rainGain.gain.linearRampToValueAtTime(r, t + 1.2);
    this.windGain.gain.linearRampToValueAtTime(w === 'snow' ? 0.09 : 0.05, t + 1.2);
  }

  footstep(run) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 1.4 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900 + Math.random() * 400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(run ? 0.16 : 0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5, 0.16);
  }

  bell() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [1, 2.01, 2.98, 4.1].forEach((m, i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 196 * m;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.16 / (i + 1), t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 2.6);
      o.connect(g).connect(this.master); o.start(t); o.stop(t + 2.8);
    });
  }

  click(freq = 660) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.1);
  }

  pickup() { this.click(880); setTimeout(() => this.click(1180), 70); }

  setVolume(v) { if (this.master) this.master.gain.value = v; }
  mute(m) { if (this.master) this.master.gain.value = m ? 0 : 0.55; }
}
