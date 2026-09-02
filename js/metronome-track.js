// Adds a metronome click as an actual extra MTrk track inside the MIDI
// file, on the same tick timeline as everything else — rather than a
// separate Web Audio engine ticking on its own clock. Since it's played
// by the exact same synth reading the exact same sequence, there is no
// drift and no phase offset: it's just another instrument in the song.
//
// Uses real General MIDI percussion notes (channel 10 / index 9), so the
// clicks come out of the same soundfont as the drums, not a synthesized
// beep from a different audio pipeline.

const MetronomeTrack = (() => {

  const GM_NOTE = {
    softWood: 77, // Low Wood Block
    highWood: 76, // Hi Wood Block
    triangle: 81, // Open Triangle
  };

  function readUInt16(bytes, i) { return (bytes[i] << 8) | bytes[i + 1]; }

  function writeUInt32(value) {
    return [(value >>> 24) & 0xFF, (value >>> 16) & 0xFF, (value >>> 8) & 0xFF, value & 0xFF];
  }

  function writeVarLen(value) {
    const groups = [value & 0x7F];
    value >>>= 7;
    while (value > 0) {
      groups.unshift((value & 0x7F) | 0x80);
      value >>>= 7;
    }
    return groups;
  }

  // Walks one MTrk chunk's event stream (delta-time + event, correctly
  // handling running status) purely to find the total tick length of the
  // track — how far its last event sits from the start.
  function trackLengthTicks(bytes, chunkStart, chunkEnd) {
    let pos = chunkStart;
    let ticks = 0;
    let runningStatus = 0;

    while (pos < chunkEnd) {
      const [delta, deltaLen] = MidiTempoRewriter.readVarLen(bytes, pos);
      pos += deltaLen;
      ticks += delta;
      if (pos >= chunkEnd) break;

      const peek = bytes[pos];
      let statusByte;
      if (peek & 0x80) { statusByte = peek; pos += 1; }
      else { statusByte = runningStatus; /* pos NOT advanced: peek is a data byte */ }

      if (statusByte === 0xFF) {
        runningStatus = 0;
        const metaType = bytes[pos]; pos += 1;
        const [len, lenBytes] = MidiTempoRewriter.readVarLen(bytes, pos);
        pos += lenBytes + len;
        if (metaType === 0x2F) break; // End of Track
      } else if (statusByte === 0xF0 || statusByte === 0xF7) {
        runningStatus = 0;
        const [len, lenBytes] = MidiTempoRewriter.readVarLen(bytes, pos);
        pos += lenBytes + len;
      } else {
        const type = statusByte & 0xF0;
        if (peek & 0x80) runningStatus = statusByte;
        const dataLen = (type === 0xC0 || type === 0xD0) ? 1 : 2;
        pos += dataLen; // consumes the peeked data byte too, if running status
      }
    }
    return ticks;
  }

  function totalDurationTicks(bytes) {
    const headerLen = MidiTempoRewriter.readUInt32(bytes, 4);
    let i = 8 + headerLen;
    let maxTicks = 0;
    while (i + 8 <= bytes.length) {
      if (!(bytes[i] === 0x4D && bytes[i + 1] === 0x54 && bytes[i + 2] === 0x72 && bytes[i + 3] === 0x6B)) break;
      const chunkLen = MidiTempoRewriter.readUInt32(bytes, i + 4);
      const chunkStart = i + 8;
      const chunkEnd = Math.min(chunkStart + chunkLen, bytes.length);
      maxTicks = Math.max(maxTicks, trackLengthTicks(bytes, chunkStart, chunkEnd));
      i = chunkEnd;
    }
    return maxTicks;
  }

  function buildClickTrackChunk(totalTicks, ticksPerBeat, note) {
    const channel = 9; // MIDI channel 10 = General MIDI percussion
    const velocity = 108;
    const clickLen = Math.max(4, Math.min(20, Math.floor(ticksPerBeat / 8)));

    // Absolute-time events, converted to deltas afterwards.
    const events = []; // { tick, bytes: [...] }
    for (let tick = 0; tick <= totalTicks; tick += ticksPerBeat) {
      events.push({ tick, bytes: [0x90 | channel, note, velocity] });      // note on
      events.push({ tick: tick + clickLen, bytes: [0x80 | channel, note, 0] }); // note off
    }
    events.sort((a, b) => a.tick - b.tick);

    const data = [];
    let lastTick = 0;
    for (const ev of events) {
      data.push(...writeVarLen(ev.tick - lastTick));
      data.push(...ev.bytes);
      lastTick = ev.tick;
    }
    // End of track meta event.
    data.push(0x00, 0xFF, 0x2F, 0x00);

    const header = [0x4D, 0x54, 0x72, 0x6B, ...writeUInt32(data.length)]; // "MTrk" + length
    return new Uint8Array([...header, ...data]);
  }

  // Returns a new Uint8Array with a click track appended, or the original
  // bytes unchanged if `soundKey` is falsy (metronome off).
  function inject(bytes, soundKey) {
    if (!soundKey || !(soundKey in GM_NOTE)) return bytes;

    const division = readUInt16(bytes, 12);
    if (division & 0x8000) return bytes; // SMPTE time division — not handled, skip silently

    const ticksPerBeat = division;
    const totalTicks = totalDurationTicks(bytes);
    if (totalTicks <= 0) return bytes;

    const clickChunk = buildClickTrackChunk(totalTicks, ticksPerBeat, GM_NOTE[soundKey]);

    const result = new Uint8Array(bytes.length + clickChunk.length);
    result.set(bytes, 0);
    result.set(clickChunk, bytes.length);

    // Bump ntrks (header bytes 10-11) and force format 1 (multiple
    // simultaneous tracks) — all the bundled loops already are format 1.
    const ntrks = readUInt16(bytes, 10) + 1;
    result[8] = 0x00; result[9] = 0x01;               // format = 1
    result[10] = (ntrks >> 8) & 0xFF; result[11] = ntrks & 0xFF;

    return result;
  }

  return { inject, GM_NOTE };
})();
