(function () {
  const playerEl = document.getElementById('midi-player');
  const engine = new MidiEngine(playerEl);

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

  let selectedSound = 'softWood';

  function currentMetroSound() {
    return metroToggle.checked ? selectedSound : null;
  }

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

    try {
      if (!_unlockCtx) _unlockCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (_unlockCtx.state !== 'running') _unlockCtx.resume();
      const buf = _unlockCtx.createBuffer(1, 1, 22050);
      const src = _unlockCtx.createBufferSource();
      src.buffer = buf;
      src.connect(_unlockCtx.destination);
      src.start(0);
    } catch (_) { /* ignore */ }

    setTimeout(() => {
      const locked = [];
      if (window.Tone && Tone.context && Tone.context.state !== 'running') locked.push('tone');
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

  playBtn.addEventListener('click', () => { unlockAudio(); engine.playTrack(targetBPM(), currentMetroSound()); });
  resyncBtn.addEventListener('click', () => { unlockAudio(); engine.playTrack(targetBPM(), currentMetroSound()); });
  nextBtn.addEventListener('click', () => { unlockAudio(); engine.nextTrack(); });
  stopBtn.addEventListener('click', () => engine.stop());

  // Toggling the metronome, or changing its sound, means rebuilding the
  // MIDI file with a different (or no) click track — so if something is
  // already playing, restart it in place at the same target tempo. That's
  // a small audible restart, but it's the price of the click being a real
  // baked-in track instead of a separately-ticking sound.
  metroToggle.addEventListener('change', () => {
    unlockAudio();
    if (engine.isPlaying) engine.playTrack(engine.currentTargetBPM, currentMetroSound());
    updateMetroBadge();
  });

  soundChips.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      unlockAudio();
      soundChips.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedSound = btn.dataset.sound;
      if (metroToggle.checked && engine.isPlaying) {
        engine.playTrack(engine.currentTargetBPM, currentMetroSound());
      }
    });
  });

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
