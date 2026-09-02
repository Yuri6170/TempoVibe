// Port of the app's MetronomeEngine (Swift/AVAudioEngine) to Web Audio.
// Same three synthesized click sounds, same envelope: a decaying sine burst.

class Metronome {
  static SOUNDS = {
    softWood: { label: '🪵 SOFT', freq: 800 },
    highWood: { label: '🪵 HIGH', freq: 1200 },
    triangle: { label: '📐 TRI',  freq: 2000 },
  };

  constructor() {
    this.isOn = false;
    this.sound = 'softWood';
    this.ctx = null;
    this.timer = null;
  }

  _ensureContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  _playClick() {
    const ctx = this._ensureContext();
    const sr = ctx.sampleRate;
    const dur = 0.04;
    const frames = Math.floor(sr * dur);
    const buffer = ctx.createBuffer(1, frames, sr);
    const data = buffer.getChannelData(0);
    const freq = Metronome.SOUNDS[this.sound].freq;
    for (let i = 0; i < frames; i++) {
      const t = i / sr;
      data[i] = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 80) * 0.8;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start();
  }

  start(bpm) {
    this.stop();
    if (!this.isOn || !bpm || bpm <= 0) return;
    this._ensureContext();
    const intervalMs = 60000.0 / bpm;
    this._playClick();
    this.timer = setInterval(() => this._playClick(), intervalMs);
  }

  // Must be called synchronously from inside a user gesture (a click/tap
  // handler) on iOS Safari, or the AudioContext stays suspended forever
  // and nothing will ever make sound.
  unlock() {
    this._ensureContext();
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  restart(bpm) {
    if (this.isOn) this.start(bpm); else this.stop();
  }
}
