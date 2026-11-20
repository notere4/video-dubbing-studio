import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/client/components/ui/button";
import { replaceFromSrt } from "@/serverFunctions/projects";

/** Download or replace the original-language subtitles, or a language track's. */
export function SubtitleFiles({
  projectId,
  lang,
  label,
  disabled,
  testSuffix = "",
}: {
  projectId: string;
  lang: string;
  label: string;
  disabled?: boolean;
  testSuffix?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const inputId = `srt-${lang}`;
  const base = `/api/projects/${projectId}/subtitles/${lang}`;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Button variant="outline" size="sm" render={<a href={`${base}?format=srt`} download data-testid={`download-srt${testSuffix}`} />}>
        SRT
      </Button>
      <Button variant="outline" size="sm" render={<a href={`${base}?format=vtt`} download data-testid={`download-vtt${testSuffix}`} />}>
        VTT
      </Button>
      <input
        id={inputId}
        type="file"
        accept=".srt,application/x-subrip,text/plain"
        className="sr-only"
        data-testid={`srt-file${testSuffix}`}
        disabled={disabled || pending}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setPending(true);
          try {
            const result = await replaceFromSrt({ data: { projectId, lang, srt: await file.text() } });
            await router.invalidate();
            toast.success(`Replaced with ${result.segments} lines from ${file.name}.`);
          } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "That file couldn't be used.");
          } finally {
            setPending(false);
          }
        }}
      />
      <Button variant="ghost" size="sm" pending={pending} disabled={disabled} render={<label htmlFor={inputId} />} nativeButton={false}>
        Replace from SRT…
      </Button>
    </div>
  );
}

export function SourceSubtitles({ projectId, disabled }: { projectId: string; disabled?: boolean }) {
  return <SubtitleFiles projectId={projectId} lang="source" label="Original subtitles" disabled={disabled} testSuffix="-source" />;
}
