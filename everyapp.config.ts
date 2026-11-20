import { defineEveryApp } from "@every-app/sdk";

export default defineEveryApp({
  id: "video-dubbing-studio",
  name: "Video Dubbing Studio",
  description:
    "Transcribe, translate, edit and dub your videos into other languages, with subtitles.",
  icon: "/icon.svg",
  access: "everyone",
  resources: {
    d1: ["DB"],
    r2: ["media"],
    ai: ["AI"],
    queues: [{ name: "JOBS", consumer: { maxBatchSize: 1, maxRetries: 0 } }],
  },
  capabilities: {
    elevenlabs: {
      access: "read",
      why: "Clones a speaker's voice and speaks the translation in it.",
      docs: "https://elevenlabs.io/app/settings/api-keys",
    },
  },
  features: {
    "voice-cloning": {
      name: "Voice cloning",
      why: "Dubs each speaker in a copy of their own voice instead of a stock voice.",
      capabilities: ["elevenlabs"],
      steps: [
        "Create an API key at https://elevenlabs.io/app/settings/api-keys.",
        "Run `everyapp provider add elevenlabs` and paste the key.",
      ],
    },
  },
});
