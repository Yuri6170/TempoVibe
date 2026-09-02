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

  playBtn.addEventListener('click', () => engine.playTrack(targetBPM()));
  resyncBtn.addEventListener('click', () => engine.playTrack(targetBPM()));
  nextBtn.addEventListener('click', () => engine.nextTrack());
  stopBtn.addEventListener('click', () => {
    engine.stop();
    metronome.stop();
  });

  metroToggle.addEventListener('change', () => {
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
