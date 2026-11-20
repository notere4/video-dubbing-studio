/** Languages a project can be transcribed from and translated into. */
export const LANGUAGES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
  pl: "Polish",
  tr: "Turkish",
  ru: "Russian",
  uk: "Ukrainian",
  ar: "Arabic",
  hi: "Hindi",
  id: "Indonesian",
  vi: "Vietnamese",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
};

export const LANGUAGE_CODES = Object.keys(LANGUAGES);

export function languageName(code: string | null | undefined): string {
  if (!code) return "Unknown";
  if (code === "auto") return "Auto-detect";
  return LANGUAGES[code] ?? code;
}

/** Stock voices by language. MeloTTS speaks these languages; Aura speaks English in several voices. */
const MELO_LANGS: Record<string, string> = {
  en: "en",
  es: "es",
  fr: "fr",
  zh: "zh",
  ja: "jp",
  ko: "kr",
};
const AURA_VOICES = [
  "asteria",
  "luna",
  "stella",
  "athena",
  "hera",
  "orion",
  "arcas",
  "perseus",
  "angus",
  "orpheus",
  "helios",
  "zeus",
];

export interface VoiceOption {
  id: string;
  label: string;
}

export function stockVoices(lang: string): VoiceOption[] {
  const voices: VoiceOption[] = [];
  if (MELO_LANGS[lang]) voices.push({ id: "standard", label: "Standard" });
  if (lang === "en")
    for (const name of AURA_VOICES)
      voices.push({
        id: `aura:${name}`,
        label: name.charAt(0).toUpperCase() + name.slice(1),
      });
  return voices;
}

export function meloLang(lang: string): string | null {
  return MELO_LANGS[lang] ?? null;
}

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  uploaded: "Uploaded",
  transcribing: "Transcribing",
  translating: "Translating",
  ready: "Ready for review",
  dubbing: "Dubbing",
  done: "Done",
  failed: "Failed",
};
