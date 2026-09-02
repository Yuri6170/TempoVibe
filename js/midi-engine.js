// Port of the app's MidiEngine (Swift/AVMIDIPlayer) for the browser.
// Same track-selection logic: exact BPM match → neighbours within ±20
// (step 5) → half-time/double-time as a last resort. The chosen file's
// tempo events are rewritten client-side to the exact target BPM before
// playback, exactly like the app does on-device.

class MidiEngine {
  constructor(playerEl) {
    this.playerEl = playerEl;      // <midi-player> element
    this.allMidiFiles = MIDI_MANIFEST.filter(f => /\.midi?$/i.test(f));
    this.lastPlayedName = '';
    this.currentTargetBPM = 140;
    this.currentMetronomeSound = null; // null = off, else 'softWood'|'highWood'|'triangle'
    this.isPlaying = false;
    this._currentBlobUrl = null;

    this.onStateChange = null;    // (state: {trackName, folderName, statusText, currentBPM, isPlaying}) => void

    this.state = {
      trackName: '---',
      folderName: '---',
      statusText: `FOUND ${this.allMidiFiles.length} TRACKS`,
      currentBPM: 140,
      isPlaying: false,
    };

    // html-midi-player fires 'stop' with detail.finished = true when a
    // track reaches its natural end (vs. being stopped manually). The
    // Swift app polls for exactly this and picks a new loop at the same
    // target tempo to keep an endless stream going — same here.
    this.playerEl.addEventListener('stop', (e) => {
      const finishedNaturally = !!(e.detail && e.detail.finished);
      if (finishedNaturally && this.isPlaying) {
        this.playTrack(this.currentTargetBPM, this.currentMetronomeSound);
      }
    });

    // Surface player-side errors (soundfont failed to load, malformed
    // MIDI, etc.) in the status line instead of failing silently.
    this.playerEl.addEventListener('error', (e) => {
      console.error('midi-player error', e.detail || e);
      this.state.statusText = `ERR: ${(e.detail && e.detail.message) || 'player error'}`;
      this._emit();
    });
  }

  // Resolves once the currently-assigned `src` has finished loading and
  // parsing (the 'load' event), or rejects on 'error' / a timeout. Setting
  // `.src` kicks off an async fetch+parse inside the component — calling
  // start() before that finishes is a no-op, which is the #1 cause of
  // "nothing plays".
  _waitForLoad(timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      let done = false;
      const onLoad = () => { if (done) return; done = true; cleanup(); resolve(); };
      const onError = (e) => { if (done) return; done = true; cleanup(); reject(new Error((e.detail && e.detail.message) || 'load failed')); };
      const timer = setTimeout(() => { if (done) return; done = true; cleanup(); reject(new Error('load timed out')); }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        this.playerEl.removeEventListener('load', onLoad);
        this.playerEl.removeEventListener('error', onError);
      };
      this.playerEl.addEventListener('load', onLoad);
      this.playerEl.addEventListener('error', onError);
    });
  }

  _emit() {
    if (this.onStateChange) this.onStateChange({ ...this.state });
  }

  _selectTrack(target) {
    const priorities = [];
    priorities.push({ bpm: target, label: '' });
    for (let delta = 5; delta <= 20; delta += 5) {
      if (target + delta <= 250) priorities.push({ bpm: target + delta, label: ` [+${delta}]` });
      if (target - delta >= 60) priorities.push({ bpm: target - delta, label: ` [-${delta}]` });
    }
    if (target % 2 === 0 && target / 2 >= 60) priorities.push({ bpm: target / 2, label: ' [×2]' });
    if (target * 2 <= 250) priorities.push({ bpm: target * 2, label: ' [÷2]' });

    for (const p of priorities) {
      const tag = `${p.bpm}_BPM`.toUpperCase();
      const matches = this.allMidiFiles.filter(f => f.toUpperCase().includes(tag));
      if (matches.length === 0) continue;

      let pool = matches;
      if (pool.length > 1) pool = pool.filter(f => f !== this.lastPlayedName);
      if (pool.length === 0) pool = matches;
      const chosen = pool[Math.floor(Math.random() * pool.length)];

      return { name: chosen, folderBPM: p.bpm };
    }
    return null;
  }

  async playTrack(bpm, metronomeSound = this.currentMetronomeSound) {
    this.currentTargetBPM = bpm;
    this.currentMetronomeSound = metronomeSound || null;
    this.state.currentBPM = bpm;

    const info = this._selectTrack(bpm);
    if (!info) {
      this.state.statusText = `NO TRACKS FOR ${bpm} BPM`;
      this.state.trackName = 'NO MATCH';
      this.state.folderName = '---';
      this._emit();
      return;
    }

    try {
      this.state.statusText = 'LOADING…';
      this._emit();

      const res = await fetch(`midi/${encodeURIComponent(info.name)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());

      let rewritten = MidiTempoRewriter.rewrite(bytes, bpm);
      if (!rewritten) throw new Error('rewrite failed');

      // Bake the metronome in as a real extra track on the same tick
      // timeline as the loop, rather than ticking on a separate clock —
      // this is what keeps it sample-accurate in time with the music.
      rewritten = MetronomeTrack.inject(rewritten, this.currentMetronomeSound);

      const blob = new Blob([rewritten], { type: 'audio/midi' });
      const url = URL.createObjectURL(blob);

      // Stop whatever's currently playing. This fires 'stop' with
      // finished:false, so it won't trigger the auto-continue handler.
      // Guarded because calling stop() before anything has ever loaded
      // can throw in some versions of the component.
      try { this.playerEl.stop(); } catch (_) { /* nothing was playing yet */ }

      if (this._currentBlobUrl) URL.revokeObjectURL(this._currentBlobUrl);
      this._currentBlobUrl = url;

      const loaded = this._waitForLoad();
      this.playerEl.src = url;
      await loaded;          // don't call start() until the file is actually parsed
      await this.playerEl.start();

      this.isPlaying = true;
      this.lastPlayedName = info.name;

      const suffix = info.folderBPM !== bpm ? ` (src: ${info.folderBPM} BPM)` : '';
      this.state.trackName = info.name.slice(0, 34);
      this.state.folderName = `TARGET: ${bpm} BPM${suffix}`;
      this.state.statusText = 'PLAYING';
      this.state.isPlaying = true;
      this._emit();
    } catch (err) {
      this.state.statusText = `ERR: ${err.message}`;
      this._emit();
    }
  }

  nextTrack() {
    this.playTrack(this.currentTargetBPM, this.currentMetronomeSound);
  }

  stop() {
    try { this.playerEl.stop(); } catch (_) { /* nothing was playing yet */ }
    this.isPlaying = false;
    this.state.trackName = '---';
    this.state.folderName = '---';
    this.state.statusText = 'STOPPED';
    this.state.isPlaying = false;
    this._emit();
  }
}

function nearestBPMStep(bpm) {
  return Math.max(60, Math.min(250, Math.round(bpm / 5) * 5));
}
