import { env } from "cloudflare:workers";
import { integrationFetch } from "@every-app/sdk/server";
import { protectTerms, type GlossaryEntry } from "@/lib/glossary";
import { languageName, meloLang } from "@/lib/languages";

const SPEECH_TO_TEXT = "@cf/openai/whisper-large-v3-turbo";
const TRANSLATOR = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const STANDARD_VOICE = "@cf/myshell-ai/melotts";
const ENGLISH_VOICES = "@cf/deepgram/aura-1";

// The AI binding's typings are per model; this app passes plain objects.
type LooseAi = { run(model: string, inputs: object): Promise<unknown> };
const ai = () => env.AI as unknown as LooseAi;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export interface SpokenSegment {
  start: number;
  end: number;
  text: string;
}

/** Speech in one WAV chunk as timed lines, offset to where the chunk starts. */
export async function transcribe(
  audio: Uint8Array,
  offset: number,
  language: string | null,
): Promise<{ language: string | null; segments: SpokenSegment[] }> {
  const result = (await ai().run(SPEECH_TO_TEXT, {
    audio: toBase64(audio),
    ...(language ? { language } : {}),
    vad_filter: true,
  })) as {
    transcription_info?: { language?: string };
    segments?: { start: number; end: number; text: string }[];
    text?: string;
  };
  const segments = (result.segments ?? [])
    .map((s) => ({
      start: offset + Number(s.start),
      end: offset + Number(s.end),
      text: String(s.text ?? "").trim(),
    }))
    .filter((s) => s.text && s.end > s.start);
  return { language: result.transcription_info?.language ?? null, segments };
}

/** One line translated, with the member's dictionary terms held to their approved wording. */
export async function translate(
  text: string,
  from: string | null,
  to: string,
  glossary: GlossaryEntry[],
): Promise<string> {
  if (!text.trim()) return "";
  const protectedTerms = protectTerms(text, glossary);
  const result = (await ai().run(TRANSLATOR, {
    messages: [
      {
        role: "system",
        content: `Translate the user's line${from ? ` from ${languageName(from)}` : ""} into ${languageName(to)}. It is a line of speech from a video, to be spoken aloud. Keep markers such as [[1]] exactly as written. Reply with the translation only.`,
      },
      { role: "user", content: protectedTerms.text },
    ],
    max_tokens: 512,
    temperature: 0.2,
  })) as { response?: string };
  const translated = String(result.response ?? "")
    .trim()
    .replace(/^"(.*)"$/s, "$1");
  if (!translated) throw new Error("The translation came back empty.");
  return protectedTerms.restore(translated);
}

async function bytesOf(result: unknown): Promise<Uint8Array> {
  if (result instanceof Uint8Array) return result;
  if (result instanceof ArrayBuffer) return new Uint8Array(result);
  if (result instanceof ReadableStream)
    return new Uint8Array(await new Response(result).arrayBuffer());
  if (result instanceof Response) return new Uint8Array(await result.arrayBuffer());
  if (result && typeof result === "object" && "audio" in result) {
    const audio = (result as { audio: unknown }).audio;
    if (typeof audio === "string") return fromBase64(audio);
    return bytesOf(audio);
  }
  throw new Error("The voice model returned no audio.");
}

export function audioType(bytes: Uint8Array): string {
  return bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46
    ? "audio/wav"
    : "audio/mpeg";
}

export interface VoiceChoice {
  voice: string;
  speed: number;
  similarity: number;
  clonedVoiceId: string | null;
}

export class VoiceUnavailableError extends Error {}

/** A line spoken in the chosen voice, as audio bytes. */
export async function speak(
  text: string,
  lang: string,
  choice: VoiceChoice,
  userId: string,
): Promise<Uint8Array> {
  if (choice.voice === "clone" && choice.clonedVoiceId) {
    const fetchVoice = integrationFetch({
      env,
      provider: "elevenlabs",
      for: { background: true, userId },
    });
    const response = await fetchVoice(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(choice.clonedVoiceId)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "content-type": "application/json", accept: "audio/mpeg" },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          language_code: lang,
          voice_settings: {
            stability: 0.5,
            similarity_boost: choice.similarity,
            speed: Math.min(1.2, Math.max(0.7, choice.speed)),
          },
        }),
      },
    );
    if (!response.ok)
      throw new VoiceUnavailableError(
        response.status === 503
          ? "Voice cloning is off."
          : `The cloned voice failed (${response.status}).`,
      );
    return new Uint8Array(await response.arrayBuffer());
  }
  if (choice.voice.startsWith("aura:") && lang === "en") {
    return bytesOf(
      await ai().run(ENGLISH_VOICES, {
        text,
        speaker: choice.voice.slice(5),
        encoding: "mp3",
      }),
    );
  }
  const melo = meloLang(lang);
  if (!melo)
    throw new VoiceUnavailableError(
      `No stock voice speaks ${languageName(lang)}. Clone a voice to dub it.`,
    );
  return bytesOf(await ai().run(STANDARD_VOICE, { prompt: text, lang: melo }));
}
