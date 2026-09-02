// Port of the app's MidiTempoRewriter (Swift) — rewrites every Set Tempo
// meta-event in a Standard MIDI File to a new target BPM, byte for byte,
// same algorithm as the iOS app.

const MidiTempoRewriter = (() => {

  function readUInt32(bytes, i) {
    if (i + 3 >= bytes.length) return 0;
    return ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
  }

  function readVarLen(bytes, start) {
    let value = 0, count = 0, i = start;
    while (i < bytes.length && count < 4) {
      const b = bytes[i];
      value = (value << 7) | (b & 0x7F);
      count += 1;
      i += 1;
      if ((b & 0x80) === 0) break;
    }
    return [value >>> 0, count];
  }

  function containsTempoEvent(bytes) {
    let i = 14;
    while (i + 4 < bytes.length) {
      if (bytes[i] === 0x4D && bytes[i + 1] === 0x54 && bytes[i + 2] === 0x72 && bytes[i + 3] === 0x6B) {
        const chunkLen = readUInt32(bytes, i + 4);
        const end = Math.min(i + 8 + chunkLen, bytes.length);
        let j = i + 8;
        while (j + 3 < end) {
          if (bytes[j] === 0xFF && bytes[j + 1] === 0x51) return true;
          j += 1;
        }
        i += 8 + chunkLen;
      } else {
        i += 1;
      }
    }
    return false;
  }

  function insertTempoAtStart(bytes, t0, t1, t2) {
    const tempoEvent = [0x00, 0xFF, 0x51, 0x03, t0, t1, t2];
    const original = bytes;
    let i = 14;
    while (i + 8 < original.length) {
      if (original[i] === 0x4D && original[i + 1] === 0x54 && original[i + 2] === 0x72 && original[i + 3] === 0x6B) {
        const insertAt = i + 8;
        const result = new Uint8Array(original.length + tempoEvent.length);
        result.set(original.subarray(0, insertAt), 0);
        result.set(tempoEvent, insertAt);
        result.set(original.subarray(insertAt), insertAt + tempoEvent.length);

        const oldLen = readUInt32(original, i + 4);
        const newLen = (oldLen + tempoEvent.length) >>> 0;
        result[i + 4] = (newLen >>> 24) & 0xFF;
        result[i + 5] = (newLen >>> 16) & 0xFF;
        result[i + 6] = (newLen >>> 8) & 0xFF;
        result[i + 7] = newLen & 0xFF;
        return result;
      }
      i += 1;
    }
    return original;
  }

  function rewrite(bytes, bpm) {
    if (bytes.length <= 14) return null;
    if (!(bytes[0] === 0x4D && bytes[1] === 0x54 && bytes[2] === 0x68 && bytes[3] === 0x64)) return null;

    const tempo = Math.round(60000000.0 / bpm);
    const t0 = (tempo >> 16) & 0xFF;
    const t1 = (tempo >> 8) & 0xFF;
    const t2 = tempo & 0xFF;

    const result = new Uint8Array(bytes); // copy
    const headerLen = readUInt32(bytes, 4);
    let i = 8 + headerLen;

    while (i + 8 < bytes.length) {
      if (!(bytes[i] === 0x4D && bytes[i + 1] === 0x54 && bytes[i + 2] === 0x72 && bytes[i + 3] === 0x6B)) break;
      const chunkLen = readUInt32(bytes, i + 4);
      const chunkStart = i + 8;
      const chunkEnd = Math.min(chunkStart + chunkLen, bytes.length);

      let j = chunkStart;
      while (j < chunkEnd) {
        // delta-time (variable length)
        let deltaLen = 0;
        while (j + deltaLen < chunkEnd && deltaLen < 4) {
          const b = bytes[j + deltaLen];
          deltaLen += 1;
          if ((b & 0x80) === 0) break;
        }
        j += deltaLen;
        if (j >= chunkEnd) break;

        const eventByte = bytes[j];

        if (eventByte === 0xFF) {
          if (j + 2 >= chunkEnd) break;
          const metaType = bytes[j + 1];
          const [metaLen, metaLenBytes] = readVarLen(bytes, j + 2);

          if (metaType === 0x51 && metaLen === 3 && j + 2 + metaLenBytes + 3 <= chunkEnd) {
            const dataStart = j + 2 + metaLenBytes;
            result[dataStart] = t0;
            result[dataStart + 1] = t1;
            result[dataStart + 2] = t2;
          }
          j += 1 + 1 + metaLenBytes + metaLen;

        } else if (eventByte === 0xF0 || eventByte === 0xF7) {
          const [sysLen, sysLenBytes] = readVarLen(bytes, j + 1);
          j += 1 + sysLenBytes + sysLen;

        } else {
          const status = eventByte & 0xF0;
          if (status === 0x80 || status === 0x90 || status === 0xA0 || status === 0xB0 || status === 0xE0) {
            j += 3;
          } else if (status === 0xC0 || status === 0xD0) {
            j += 2;
          } else {
            j += 1;
          }
        }
      }
      i = chunkEnd;
    }

    if (!containsTempoEvent(bytes)) {
      return insertTempoAtStart(result, t0, t1, t2);
    }
    return result;
  }

  return { rewrite };
})();
