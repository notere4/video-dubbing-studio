# Video Dubbing Studio

Upload a video, get its speech transcribed and translated line by line, fix anything in an editor, and dub it into other languages with stock or cloned voices. Subtitles come out as SRT or VTT.

Inspired by rask.ai

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Upload a video or audio file as a project, pick its languages, and follow its progress, with a retry when processing fails.
- Get timed, speaker-labelled transcripts translated into each language, and translate one line or a whole language again.
- Edit text, translations, timings, speakers, voices and speed line by line next to a player that jumps to each line.
- Dub a language, play the video with the dubbed track, download the audio, and re-dub only the lines you changed.
- Download, show and replace subtitles, and keep a dictionary of terms every translation must follow.

Left out: accounts and sign-in, which your Gateway handles; lip-sync; on-screen text translation; burned-in subtitles and dubbed video export; a public API; plans and billing; team review and enterprise controls; the extra audio, script and live tools.

## Setup

```sh
pnpm install
pnpm dev                       # local, behind a development Gateway
pnpm test                      # unit tests
pnpm everyapp install <repo>   # or `pnpm run deploy` from a checkout
```

The packaged-release checks in `checks/` run with `node /path/to/try-release.mjs` in an oss.new workspace.

Nothing has to be set before the app opens. It uses Workers AI (speech recognition, translation and stock voices), D1, R2 and a Queue, which the deploy creates. Voice cloning is optional: add an ElevenLabs key with `everyapp provider add elevenlabs` (keys at https://elevenlabs.io/app/settings/api-keys).

## Limitations

- The browser reads the file's sound before upload, so a file the browser can't decode can't be used; uploads are capped at 500 MB.
- Stock voices speak English, Spanish, French, Chinese, Japanese and Korean; other languages need a cloned voice.
- Every line starts as "Speaker 1"; rename speakers in the editor.
- The dubbed audio track is mixed in your browser after each dub, so keep the project open until the download appears.
- Workers AI usage is billed to your Cloudflare account, and ElevenLabs usage to your ElevenLabs account.
- The local checks use a stand-in for Workers AI and ElevenLabs; real model output and a live deployment were not tested here.
