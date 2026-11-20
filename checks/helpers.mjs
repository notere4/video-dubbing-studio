// Shared pieces of the suites: a local stand-in for the Workers AI binding
// (speech to text, translation, speech) and the browser steps that make a project.
import { expect } from '/home/user/oss-new/control/runtime/index.mjs';

const FAKE_AI = String.raw`
import { WorkerEntrypoint } from "cloudflare:workers";
const SPANISH = {
  "Welcome back to the bakery.": "Bienvenidos de nuevo a la panaderia.",
  "Today we bake [[1]] bread from scratch.": "Hoy horneamos pan de [[1]] desde cero.",
  "Let the dough rest for an hour.": "Deja reposar la masa una hora.",
};
let failedOnce = false;
function wav(seconds) {
  const rate = 8000, n = Math.floor(rate * seconds), buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin(i / 8) * 8000), true);
  return new Uint8Array(buf);
}
function b64(bytes) { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); }
export default class extends WorkerEntrypoint {
  async fetch() { return new Response("fake ai"); }
  async run(model, inputs) {
    if (model.includes("whisper")) {
      if (inputs.language === "de" && !failedOnce) { failedOnce = true; throw new Error("speech model unavailable"); }
      return { transcription_info: { language: inputs.language || "en" }, text: "", segments: [
        { start: 0, end: 1.8, text: " Welcome back to the bakery." },
        { start: 2, end: 3.8, text: " Today we bake sourdough bread from scratch." },
        { start: 4, end: 5.8, text: " Let the dough rest for an hour." },
      ] };
    }
    if (model.includes("melotts")) return { audio: b64(wav(1.2)) };
    if (model.includes("aura")) return wav(1.2);
    const text = inputs.messages[inputs.messages.length - 1].content.trim();
    return { response: SPANISH[text] ?? "(es) " + text };
  }
}`;

export const fakeAi = {
  bindings: { AI: { type: 'worker', worker: 'fake-ai' } },
  workers: [{ config: { name: 'fake-ai', compatibilityDate: '2025-04-01', manifest: { mainModule: 'ai.mjs', modules: { 'ai.mjs': { type: 'esm', contents: Buffer.from(FAKE_AI) } } } } }],
};

/** A short mono WAV a browser can decode: a stand-in for a recorded clip. */
export function sampleWav(seconds = 6) {
  const rate = 16000, n = rate * seconds, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin(i / 6) * 6000 * Math.sin(i / 4000)), 44 + i * 2);
  return buf;
}

/** Creates a project through the upload dialog and returns its id once it opens. */
export async function createProject(page, { name, file = 'bakery-tour.wav', source = 'English', targets = ['es'] }) {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.getByTestId('project-file').setInputFiles({ name: file, mimeType: 'audio/wav', buffer: sampleWav() });
  await page.getByTestId('project-name').fill(name);
  await page.getByTestId('source-lang').click();
  await page.getByRole('option', { name: source, exact: true }).click();
  for (const target of targets) await page.getByTestId(`target-${target}`).check();
  await Promise.all([page.waitForURL(/\/projects\/[0-9a-f-]{36}/, { timeout: 30000 }), page.getByTestId('create-project').click()]);
  return page.url().match(/\/projects\/([0-9a-f-]{36})/)[1];
}

export async function waitForStatus(page, text, timeout = 60000) {
  await expect(page.getByTestId('project-status')).toHaveText(text, { timeout });
}
