/** Audio work done in the browser: Workers can't decode media. */

const SPEECH_RATE = 16000;

export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

async function decode(data: ArrayBuffer): Promise<AudioBuffer> {
  const context = new AudioContext();
  try {
    return await context.decodeAudioData(data);
  } finally {
    void context.close();
  }
}

/** The file's sound as 16 kHz mono, which speech recognition reads. */
export async function speechAudio(file: Blob): Promise<{ duration: number; samples: Float32Array }> {
  let decoded: AudioBuffer;
  try {
    decoded = await decode(await file.arrayBuffer());
  } catch {
    throw new Error("This file's sound couldn't be read. Try an MP4, MOV, WebM, MP3, WAV or M4A file.");
  }
  const length = Math.max(1, Math.ceil(decoded.duration * SPEECH_RATE));
  const offline = new OfflineAudioContext(1, length, SPEECH_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return { duration: decoded.duration, samples: rendered.getChannelData(0) };
}

/** Speech audio cut into WAV chunks of `seconds` each. */
export function speechChunks(samples: Float32Array, seconds: number): Blob[] {
  const size = seconds * SPEECH_RATE;
  const chunks: Blob[] = [];
  for (let offset = 0; offset < samples.length; offset += size)
    chunks.push(encodeWav(samples.subarray(offset, offset + size), SPEECH_RATE));
  return chunks;
}

/** Up to `limit` seconds of the given time ranges, joined: a sample of one speaker. */
export function sampleOf(
  samples: Float32Array,
  ranges: { start: number; end: number }[],
  limit = 90,
): Blob {
  const parts: Float32Array[] = [];
  let total = 0;
  for (const range of ranges) {
    if (total >= limit * SPEECH_RATE) break;
    const part = samples.subarray(
      Math.floor(range.start * SPEECH_RATE),
      Math.floor(range.end * SPEECH_RATE),
    );
    parts.push(part);
    total += part.length;
  }
  const joined = new Float32Array(total);
  let at = 0;
  for (const part of parts) {
    joined.set(part, at);
    at += part.length;
  }
  return encodeWav(joined, SPEECH_RATE);
}

export interface Clip {
  url: string;
  start: number;
  end: number;
  speed: number;
}

const MIX_RATE = 24000;

/**
 * Lays each spoken clip at its segment's start. A clip longer than its
 * segment is sped up to fit (up to 1.6×); the speaker's speed applies on top.
 */
export async function mixTrack(clips: Clip[], duration: number): Promise<Blob> {
  const decoded = await Promise.all(
    clips.map(async (clip) => {
      const response = await fetch(clip.url);
      if (!response.ok) throw new Error("A spoken line couldn't be loaded.");
      return { clip, buffer: await decode(await response.arrayBuffer()) };
    }),
  );
  const end = Math.max(duration, ...decoded.map(({ clip }) => clip.end));
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(end * MIX_RATE)), MIX_RATE);
  for (const { clip, buffer } of decoded) {
    const slot = Math.max(0.1, clip.end - clip.start);
    const fit = Math.min(1.6, Math.max(1, buffer.duration / clip.speed / slot));
    const source = offline.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = clip.speed * fit;
    source.connect(offline.destination);
    source.start(clip.start);
  }
  const rendered = await offline.startRendering();
  return encodeWav(rendered.getChannelData(0), MIX_RATE);
}
