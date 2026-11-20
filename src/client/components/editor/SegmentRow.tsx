import { useRouter } from "@tanstack/react-router";
import { Languages, Play } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Textarea } from "@/client/components/ui/textarea";
import { formatTimecode, parseTimecode } from "@/lib/subtitles";
import { retranslateSegment, updateSegment } from "@/serverFunctions/projects";

export interface SegmentView {
  id: string;
  start: number;
  end: number;
  text: string;
  speaker: string;
  translation: string;
  needsRedub: boolean;
}

export function SegmentRow({
  projectId,
  lang,
  segment,
  locked,
  onSeek,
}: {
  projectId: string;
  lang: string;
  segment: SegmentView;
  locked: boolean;
  onSeek: (seconds: number) => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState({
    start: formatTimecode(segment.start),
    end: formatTimecode(segment.end),
    speaker: segment.speaker,
    text: segment.text,
    translation: segment.translation,
  });
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const dirty =
    draft.start !== formatTimecode(segment.start) ||
    draft.end !== formatTimecode(segment.end) ||
    draft.speaker !== segment.speaker ||
    draft.text !== segment.text ||
    draft.translation !== segment.translation;

  async function save() {
    const start = parseTimecode(draft.start);
    const end = parseTimecode(draft.end);
    if (start === null || end === null) return void toast.error("Write times as mm:ss.mmm.");
    if (end <= start) return void toast.error("The end must come after the start.");
    if (!draft.speaker.trim()) return void toast.error("Name the speaker.");
    setSaving(true);
    try {
      await updateSegment({
        data: { projectId, segmentId: segment.id, lang, start, end, speaker: draft.speaker.trim(), text: draft.text, translation: draft.translation },
      });
      toast.success("Saved");
      await router.invalidate();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "That didn't save.");
    } finally {
      setSaving(false);
    }
  }

  async function retranslate() {
    setTranslating(true);
    try {
      await retranslateSegment({ data: { projectId, segmentId: segment.id, lang } });
      await router.invalidate();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "That didn't translate.");
    } finally {
      setTranslating(false);
    }
  }

  const field = (key: keyof typeof draft) => ({
    value: draft[key],
    disabled: locked,
    onChange: (event: { target: { value: string } }) => setDraft((d) => ({ ...d, [key]: event.target.value })),
  });

  return (
    <li data-testid="segment" className="space-y-3 px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon-sm" aria-label={`Play from ${formatTimecode(segment.start)}`} data-testid="segment-seek" onClick={() => onSeek(segment.start)}>
          <Play />
        </Button>
        <Input aria-label="Start" data-testid="segment-start" className="h-8 w-28 font-mono text-xs tabular-nums" {...field("start")} />
        <span className="text-muted-foreground">–</span>
        <Input aria-label="End" data-testid="segment-end" className="h-8 w-28 font-mono text-xs tabular-nums" {...field("end")} />
        <Input aria-label="Speaker" data-testid="segment-speaker" className="h-8 w-32" maxLength={60} {...field("speaker")} />
        {segment.needsRedub && (
          <Badge variant="outline" data-testid="needs-redub">
            Needs re-dub
          </Badge>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Textarea aria-label="Original" data-testid="segment-source" rows={2} maxLength={2000} {...field("text")} />
        <Textarea aria-label="Translation" data-testid="segment-translation" rows={2} maxLength={2000} {...field("translation")} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" data-testid="segment-retranslate" pending={translating} disabled={locked || dirty} onClick={() => void retranslate()}>
          <Languages data-icon="inline-start" />
          Translate again
        </Button>
        <Button size="sm" data-testid="segment-save" pending={saving} disabled={locked || !dirty} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </li>
  );
}
