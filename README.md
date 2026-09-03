# VeloVibe — web player

A working, static web version of the VeloVibe iOS app: 295 bundled MIDI drum
loops, retimed to any BPM from 60–250 client-side in JavaScript, played back
through a General MIDI synth in the browser. No backend, no build step.

## Adding your own loops

Drop a `.mid` file into `midi/`, named like the existing ones —
`{tempo}_BPM_{anything unique}.mid`, tempo zero-padded to 3 digits and a
multiple of 5 (e.g. `080_BPM_MyGroove1.mid` for an 80 BPM loop). Commit and
push. That's it — nothing else to edit.

The site asks GitHub's API for whatever is actually in `midi/` each time the
page loads, so a new file shows up on its own. `js/manifest.js` is only a
fallback for when that API call can't run (testing locally over
`python3 -m http.server`, offline, or GitHub's public API rate limit — 60
unauthenticated requests/hour per visitor — gets hit). If you want the site
to keep working even in that fallback case, add the filename to the
`MIDI_MANIFEST` array in `js/manifest.js` too; if you don't, you only lose
the new file when the dynamic lookup happens to fail, everything else keeps
working.

## How it works

- `midi/` — all 295 loops from the app, copied byte-for-byte.
- `js/manifest.js` — a static fallback filename list, used only if the
  GitHub API lookup below fails.
- `js/github-manifest.js` — asks GitHub's REST API what's actually in
  `midi/` right now, so new files don't need a manifest edit to show up.
- `js/tempo-rewriter.js` — a JS port of the app's Swift `MidiTempoRewriter`:
  finds every Set Tempo meta-event in a MIDI file and overwrites it with the
  target BPM, byte for byte.
- `js/midi-engine.js` — a JS port of the app's `MidiEngine`, with one
  deliberate change: instead of pulling from a single tempo, this pools two
  kinds of related tempos together — linear neighbours within ±10 BPM
  (target 170 → also 160/165/175/180), and octave-related tempos reachable
  by repeated ×2 / ÷2 while staying inside 60–250 (target 60 → also 120,
  240; target 120 → also 60, 240). A loop tagged 120 played back at 60 is a
  genuine half-time feel of the same groove, not a different one, which is
  why it's safe to pool alongside merely-nearby tempos. Whatever gets
  picked is retimed to the exact target BPM before playback either way, and
  the metronome track (below) is built on that same rewritten tempo — so it
  always ticks at the target BPM shown on the slider, never at the source
  loop's original tag.
- `js/metronome-track.js` — the metronome, implemented by adding a real
  extra track to the MIDI file itself (real General MIDI percussion notes:
  wood block, triangle) rather than a separately-ticking Web Audio engine.
  Since it's just another instrument in the same sequence, played by the
  same synth reading the same clock, it can't drift out of time with the
  music — unlike a `setInterval`-based click, which will.
- Playback itself is handled by [html-midi-player](https://github.com/cifkao/html-midi-player)
  (loaded from jsDelivr), which plays a rewritten MIDI file through a General
  MIDI soundfont — a different, lighter soundfont than the app's bundled
  26 MB `GeneralUser.sf2`, so instrument timbres will sound close but not
  identical to the app.

Turning the metronome on/off, or changing its sound, rebuilds the MIDI file
with a different (or no) click track and restarts playback in place at the
same target tempo — a small audible restart, the price of the click being a
genuine baked-in track instead of an independent sound.

## Publish it with GitHub Pages

1. Create a new repo, e.g. `velovibe-web`.
2. Upload everything in this folder (`index.html`, `css/`, `js/`, `midi/`) to
   the repo root, preserving the folder structure.
3. **Settings → Pages** → Source: `Deploy from a branch`, branch `main`,
   folder `/ (root)`. Save.
4. You'll get a live URL after a minute or two, typically
   `https://<your-username>.github.io/velovibe-web/`.

## Testing locally

Opening `index.html` directly by double-clicking it may fail in some browsers
(Chrome in particular blocks `fetch()` of local files over `file://`). Serve
it over a local server instead, from this folder:

```
python3 -m http.server 8000
```

then open `http://localhost:8000`.

## If you want the exact same sound as the app

The app's timbre comes from its bundled `GeneralUser.sf2` (26 MB — not
included here to keep the page light). To use it instead:

1. Copy `GeneralUser.sf2` into this folder.
2. In `index.html`, change the `sound-font` attribute on `<midi-player>` to
   `sound-font="GeneralUser.sf2"`.

Loading a 26 MB soundfont will make the first play noticeably slower.
