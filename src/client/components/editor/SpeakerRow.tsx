import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { SimpleSelect } from "@/client/components/SimpleSelect";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { sampleOf, speechAudio } from "@/client/lib/audio";
import { stockVoices } from "@/lib/languages";
import { updateSpeaker } from "@/serverFunctions/projects";

export interface SpeakerView {
  name: string;
  voice: string;
  speed: number;
  similarity: number;
  cloned: boolean;
}

export function SpeakerRow({
  projectId,
  lang,
  speaker,
  ranges,
  cloning,
  locked,
}: {
  projectId: string;
  lang: string;
  speaker: SpeakerView;
  ranges: { start: number; end: number }[];
  cloning: boolean;
  locked: boolean;
}) {
  const router = useRouter();
  const [speed, setSpeed] = useState(String(speaker.speed));
  const [similarity, setSimilarity] = useState(String(speaker.similarity));
  const [cloningNow, setCloningNow] = useState(false);
  const voices = [
    ...stockVoices(lang).map((v) => ({ value: v.id, label: v.label })),
    ...(speaker.cloned ? [{ value: "clone", label: "Cloned voice" }] : []),
  ];
  const voice = voices.some((v) => v.value === speaker.voice) ? speaker.voice : (voices[0]?.value ?? "standard");

  async function save(change: Partial<{ voice: string; speed: number; similarity: number }>) {
    const next = {
      voice,
      speed: Number(speed),
      similarity: Number(similarity),
      ...change,
    };
    if (!(next.speed >= 0.5 && next.speed <= 2)) return void toast.error("Speed goes from 0.5 to 2.");
    if (!(next.similarity >= 0 && next.similarity <= 1)) return void toast.error("Similarity goes from 0 to 1.");
    if (next.voice === speaker.voice && next.speed === speaker.speed && next.similarity === speaker.similarity) return;
    try {
      await updateSpeaker({ data: { projectId, name: speaker.name, ...next } });
      await router.invalidate();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "That didn't save.");
    }
  }

  async function clone() {
    setCloningNow(true);
    try {
      const media = await fetch(`/api/projects/${projectId}/media`);
      if (!media.ok) throw new Error("The video couldn't be loaded.");
      const { samples } = await speechAudio(await media.blob());
      const response = await fetch(`/api/projects/${projectId}/voices?speaker=${encodeURIComponent(speaker.name)}`, {
        method: "POST",
        body: sampleOf(samples, ranges),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Cloning failed.");
      toast.success(`Cloned ${speaker.name}'s voice.`);
      await router.invalidate();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Cloning failed.");
    } finally {
      setCloningNow(false);
    }
  }

  return (
    <li data-testid="speaker" className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="min-w-24 flex-1 truncate font-medium">{speaker.name}</span>
      {voices.length > 0 ? (
        <SimpleSelect items={voices} value={voice} onChange={(v) => void save({ voice: v })} label={`Voice for ${speaker.name}`} testId="speaker-voice" size="sm" disabled={locked} />
      ) : (
        <span className="text-sm text-muted-foreground">No stock voice</span>
      )}
      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        Speed
        <Input
          type="number"
          step="0.05"
          min="0.5"
          max="2"
          data-testid="speaker-speed"
          className="h-7 w-20"
          value={speed}
          disabled={locked}
          onChange={(e) => setSpeed(e.target.value)}
          onBlur={() => void save({ speed: Number(speed) })}
        />
        ×
      </label>
      {voice === "clone" && (
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          Similarity
          <Input
            type="number"
            step="0.05"
            min="0"
            max="1"
            data-testid="speaker-similarity"
            className="h-7 w-20"
            value={similarity}
            disabled={locked}
            onChange={(e) => setSimilarity(e.target.value)}
            onBlur={() => void save({ similarity: Number(similarity) })}
          />
        </label>
      )}
      {cloning && (
        <Button variant="outline" size="sm" data-testid="speaker-clone" pending={cloningNow} disabled={locked} onClick={() => void clone()}>
          {speaker.cloned ? "Clone again" : "Clone voice"}
        </Button>
      )}
    </li>
  );
}
