import { useRouter } from "@tanstack/react-router";
import { Download, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { SegmentRow } from "@/client/components/editor/SegmentRow";
import { SpeakerRow } from "@/client/components/editor/SpeakerRow";
import { SubtitleFiles } from "@/client/components/editor/SourceSubtitles";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Label } from "@/client/components/ui/label";
import { Switch } from "@/client/components/ui/switch";
import { mixTrack } from "@/client/lib/audio";
import { languageName } from "@/lib/languages";
import { retranslateTrack, startDub } from "@/serverFunctions/projects";
import type { ProjectDetail } from "@/routes/projects/$id";

const TRACK_LABELS: Record<string, string> = {
  idle: "Not dubbed",
  translating: "Translating",
  dubbing: "Dubbing",
  dubbed: "Dubbed",
  failed: "Failed",
};

const panel = "overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xs";

export function LanguageTrack({
  detail,
  lang,
  videoRef,
}: {
  detail: ProjectDetail;
  lang: string;
  videoRef: RefObject<HTMLMediaElement | null>;
}) {
  const router = useRouter();
  const { project, segments, speakers } = detail;
  const track = detail.tracks.find((t) => t.lang === lang);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [dubOn, setDubOn] = useState(false);
  const [captions, setCaptions] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [mixing, setMixing] = useState(false);
  const [mixError, setMixError] = useState<string | null>(null);

  const ready = ["ready", "done", "dubbing"].includes(project.status);
  const working = track?.status === "translating" || track?.status === "dubbing";
  const locked = !ready || working;
  const rows = segments.map((s) => ({
    id: s.id,
    start: s.start,
    end: s.end,
    text: s.text,
    speaker: s.speaker,
    translation: s.translations[lang]?.text ?? "",
    needsRedub: s.translations[lang]?.needsRedub ?? false,
    dubbed: s.translations[lang]?.dubbed ?? false,
  }));
  const changed = rows.filter((r) => r.needsRedub).length;
  const undubbed = rows.filter((r) => !r.dubbed && r.translation.trim()).length;
  const revision = track?.revision ?? 0;
  const mixed = revision > 0 && track?.mixedRevision === revision;
  const trackUrl = `/api/projects/${project.id}/tracks/${lang}?r=${revision}`;

  // Each dub run gives the track a new revision; mix its clips into one audio file.
  const mixingFor = useRef(0);
  async function mix() {
    if (!track || mixingFor.current === revision) return;
    mixingFor.current = revision;
    setMixing(true);
    setMixError(null);
    try {
      const speed = new Map(speakers.map((s) => [s.name, s.speed]));
      const blob = await mixTrack(
        rows
          .filter((r) => r.dubbed)
          .map((r) => ({
            url: `/api/projects/${project.id}/clips/${lang}/${r.id}?r=${revision}`,
            start: r.start,
            end: r.end,
            speed: speed.get(r.speaker) ?? 1,
          })),
        project.durationSec,
      );
      const response = await fetch(`/api/projects/${project.id}/tracks/${lang}?revision=${revision}`, { method: "PUT", body: blob });
      if (!response.ok && response.status !== 409) throw new Error("The audio track couldn't be saved.");
      await router.invalidate();
    } catch (cause) {
      mixingFor.current = 0;
      setMixError(cause instanceof Error ? cause.message : "The audio track couldn't be built.");
    } finally {
      setMixing(false);
    }
  }
  useEffect(() => {
    if (track?.status === "dubbed" && revision > (track.mixedRevision ?? 0) && !mixError) void mix();
  });

  // The dubbed track follows the video: play, pause, seek and speed.
  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video) return;
    video.muted = dubOn && mixed;
    if (!audio || !dubOn || !mixed) {
      audio?.pause();
      return;
    }
    const sync = () => {
      audio.currentTime = video.currentTime;
      audio.playbackRate = video.playbackRate;
      if (video.paused) audio.pause();
      else void audio.play().catch(() => undefined);
    };
    sync();
    const events = ["play", "pause", "seeked", "ratechange"] as const;
    for (const event of events) video.addEventListener(event, sync);
    return () => {
      for (const event of events) video.removeEventListener(event, sync);
      audio.pause();
      video.muted = false;
    };
  }, [dubOn, mixed, videoRef, trackUrl]);

  // Subtitles of this language over the preview.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !captions) return;
    const element = document.createElement("track");
    element.kind = "subtitles";
    element.label = languageName(lang);
    element.srclang = lang;
    element.src = `/api/projects/${project.id}/subtitles/${lang}?format=vtt&v=${encodeURIComponent(rows.map((r) => r.translation).join("|").length)}`;
    element.default = true;
    video.appendChild(element);
    element.track.mode = "showing";
    return () => {
      element.remove();
    };
  }, [captions, lang, project.id, videoRef, rows.map((r) => `${r.start}${r.end}${r.translation}`).join("|")]);

  // An audio file has no picture to draw subtitles on: show the line below the player.
  const [now, setNow] = useState(0);
  useEffect(() => {
    const media = videoRef.current;
    if (!media || !captions || media instanceof HTMLVideoElement) return;
    const tick = () => setNow(media.currentTime);
    tick();
    media.addEventListener("timeupdate", tick);
    media.addEventListener("seeked", tick);
    return () => {
      media.removeEventListener("timeupdate", tick);
      media.removeEventListener("seeked", tick);
    };
  }, [captions, videoRef]);
  const audioOnly = project.mediaType.startsWith("audio/");
  const currentLine = rows.find((r) => now >= r.start && now < r.end)?.translation ?? "";

  async function act(work: () => Promise<unknown>) {
    setPending(true);
    try {
      await work();
      await router.invalidate();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "That didn't work.");
    } finally {
      setPending(false);
    }
  }

  const dubLabel =
    track?.status === "dubbing"
      ? `Dubbing… ${track.progress}%`
      : revision === 0
        ? `Dub ${languageName(lang)}`
        : changed + undubbed > 0
          ? `Re-dub ${changed + undubbed} changed`
          : "Up to date";

  const ranges = (name: string) => segments.filter((s) => s.speaker === name).map((s) => ({ start: s.start, end: s.end }));

  return (
    <section className="space-y-6">
      <div className={`${panel} space-y-4 p-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">{languageName(lang)}</h2>
            <Badge variant={track?.status === "failed" ? "destructive" : track?.status === "dubbed" ? "soft" : "secondary"} data-testid="track-status">
              {TRACK_LABELS[track?.status ?? "idle"]}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" data-testid="retranslate-track" disabled={locked} onClick={() => setConfirming(true)}>
              <RefreshCw data-icon="inline-start" />
              Translate all again
            </Button>
            <Button
              size="sm"
              data-testid="start-dub"
              pending={pending || track?.status === "dubbing"}
              disabled={locked || (revision > 0 && changed + undubbed === 0)}
              onClick={() => void act(() => startDub({ data: { projectId: project.id, lang } }))}
            >
              {dubLabel}
            </Button>
          </div>
        </div>
        {track?.status === "failed" && track.error && (
          <Alert variant="destructive">
            <AlertDescription>{track.error}</AlertDescription>
          </Alert>
        )}
        {mixError && (
          <Alert variant="destructive">
            <AlertDescription>
              {mixError}{" "}
              <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setMixError(null)}>
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2">
            <Switch id={`dub-${lang}`} data-testid="dub-toggle" checked={dubOn && mixed} disabled={!mixed} onCheckedChange={setDubOn} />
            <Label htmlFor={`dub-${lang}`}>Dubbed audio</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id={`cc-${lang}`} data-testid="captions-toggle" checked={captions} onCheckedChange={setCaptions} />
            <Label htmlFor={`cc-${lang}`}>Subtitles</Label>
          </div>
          {mixing && <span className="text-sm text-muted-foreground">Building the audio track…</span>}
          {mixed && !mixing && (
            <Button variant="outline" size="sm" render={<a href={`${trackUrl}&download=1`} download data-testid="download-audio" />}>
              <Download data-icon="inline-start" />
              Dubbed audio (WAV)
            </Button>
          )}
        </div>
        {captions && audioOnly && currentLine && (
          <p className="rounded-lg bg-muted px-3 py-2 text-center text-sm" data-testid="caption-line">
            {currentLine}
          </p>
        )}
        {mixed && <audio ref={audioRef} src={trackUrl} preload="auto" className="hidden" />}
        <SubtitleFiles projectId={project.id} lang={lang} label="Subtitles" disabled={locked} />
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Voices</h3>
        <ul className={`${panel} divide-y divide-border`}>
          {speakers.map((speaker) => (
            <SpeakerRow
              key={`${speaker.name}:${speaker.voice}:${speaker.speed}:${speaker.similarity}:${speaker.cloned}`}
              projectId={project.id}
              lang={lang}
              speaker={speaker}
              ranges={ranges(speaker.name)}
              cloning={detail.voiceCloning}
              locked={locked}
            />
          ))}
        </ul>
        {!detail.voiceCloning && (
          <p className="text-sm text-muted-foreground" data-testid="voice-cloning-off">
            Voice cloning is off until an admin adds an ElevenLabs key.
          </p>
        )}
      </div>

      <ul className={`${panel} divide-y divide-border`}>
        {rows.map((row) => (
          <SegmentRow
            key={`${row.id}:${row.start}:${row.end}:${row.speaker}:${row.text}:${row.translation}`}
            projectId={project.id}
            lang={lang}
            segment={row}
            locked={locked}
            onSeek={(seconds) => {
              const video = videoRef.current;
              if (!video) return;
              video.currentTime = seconds;
              void video.play().catch(() => undefined);
            }}
          />
        ))}
      </ul>

      {confirming && (
        <ConfirmDialog
          title={`Translate all of ${languageName(lang)} again?`}
          confirmLabel="Translate again"
          pending={pending}
          onClose={() => setConfirming(false)}
          onConfirm={() =>
            void act(() => retranslateTrack({ data: { projectId: project.id, lang } })).then(() => setConfirming(false))
          }
        >
          Your edits to these translations are replaced.
        </ConfirmDialog>
      )}
    </section>
  );
}
