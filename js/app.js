(function () {
  const playerEl = document.getElementById('midi-player');
  const engine = new MidiEngine(playerEl);
  const metronome = new Metronome();

  const bpmSlider = document.getElementById('bpm-slider');
  const bpmValue = document.getElementById('bpm-value');
  const playBpmLabel = document.getElementById('play-bpm');
  const playBtn = document.getElementById('play-btn');
  const nextBtn = document.getElementById('next-btn');
  const stopBtn = document.getElementById('stop-btn');
  const resyncBtn = document.getElementById('resync-btn');
  const metroToggle = document.getElementById('metro-toggle');
  const soundChips = document.getElementById('sound-chips');
  const trkEl = document.getElementById('trk');
  const folderEl = document.getElementById('folder');
  const statusEl = document.getElementById('status');
  const metroBadge = document.getElementById('metro-badge');
  const trackCountEl = document.getElementById('track-count');

  trackCountEl.textContent = engine.allMidiFiles.length;
  statusEl.textContent = `SYS: ${engine.state.statusText}`;

  // iOS Safari (and to a lesser extent other mobile browsers) will only
  // let audio start if it's triggered synchronously inside a user-gesture
  // handler — not after any `await`. This runs first, synchronously, on
  // every button press, before any of the fetch/parse work that follows.
  // Playing a real (near-silent) buffer through a throwaway AudioContext
  // is the standard trick to unlock WebKit's audio permission for the
  // whole page, since the MIDI player's own internal audio context isn't
  // something we can reach directly.
  let _unlockCtx = null;
  function unlockAudio() {
    try {
      if (window.Tone && Tone.context && Tone.context.state !== 'running') {
        Tone.start();
      }
    } catch (_) { /* Tone not loaded yet — playerEl will still try on its own */ }

    metronome.unlock();

    try {
      if (!_unlockCtx) _unlockCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (_unlockCtx.state !== 'running') _unlockCtx.resume();
      const buf = _unlockCtx.createBuffer(1, 1, 22050);
      const src = _unlockCtx.createBufferSource();
      src.buffer = buf;
      src.connect(_unlockCtx.destination);
      src.start(0);
    } catch (_) { /* ignore */ }

    // If audio is still locked a moment later, say so on-screen — the
    // usual fix on iOS is simply tapping the button a second time.
    setTimeout(() => {
      const locked = [];
      if (window.Tone && Tone.context && Tone.context.state !== 'running') locked.push('tone');
      if (metronome.ctx && metronome.ctx.state !== 'running') locked.push('metro');
      if (_unlockCtx && _unlockCtx.state !== 'running') locked.push('page');
      if (locked.length) statusEl.textContent = `SYS: AUDIO LOCKED (${locked.join(',')}) — TAP PLAY AGAIN`;
    }, 700);
  }

  function targetBPM() {
    return nearestBPMStep(Number(bpmSlider.value));
  }

  function refreshBpmDisplay() {
    const t = targetBPM();
    bpmValue.textContent = t;
    playBpmLabel.textContent = t;
  }
  bpmSlider.addEventListener('input', refreshBpmDisplay);
  refreshBpmDisplay();

  playBtn.addEventListener('click', () => { unlockAudio(); engine.playTrack(targetBPM()); });
  resyncBtn.addEventListener('click', () => { unlockAudio(); engine.playTrack(targetBPM()); });
  nextBtn.addEventListener('click', () => { unlockAudio(); engine.nextTrack(); });
  stopBtn.addEventListener('click', () => {
    engine.stop();
    metronome.stop();
  });

  metroToggle.addEventListener('change', () => {
    unlockAudio();
    metronome.isOn = metroToggle.checked;
    if (metronome.isOn && engine.isPlaying) {
      metronome.start(engine.state.currentBPM);
    } else {
      metronome.stop();
    }
    updateMetroBadge();
  });

  soundChips.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      unlockAudio();
      soundChips.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      metronome.sound = btn.dataset.sound;
      if (metronome.isOn && engine.isPlaying) {
        metronome.restart(engine.state.currentBPM);
      }
    });
  });

  engine.onTrackStarted = (bpm) => {
    bpm > 0 ? metronome.restart(bpm) : metronome.stop();
    updateMetroBadge();
  };

  function updateMetroBadge() {
    metroBadge.textContent = (metroToggle.checked && engine.isPlaying)
      ? `🥁 ${engine.state.currentBPM} BPM`
      : '';
  }

  engine.onStateChange = (state) => {
    trkEl.textContent = `TRK: ${state.trackName}`;
    folderEl.textContent = state.folderName;
    statusEl.textContent = `SYS: ${state.statusText}`;
    updateMetroBadge();
  };

  // Surface anything unexpected directly on the LCD status line too —
  // useful for diagnosing on a phone where there's no console open.
  window.addEventListener('error', (e) => {
    console.error(e.error || e.message);
    statusEl.textContent = `SYS: ERR: ${e.message}`;
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error(e.reason);
    statusEl.textContent = `SYS: ERR: ${e.reason && e.reason.message ? e.reason.message : e.reason}`;
  });
})();
