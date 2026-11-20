import { createFileRoute } from "@tanstack/react-router";
import { memberProject, notFoundResponse } from "@/server/http";
import { listSegments, listTranslations, targetLangs } from "@/server/projects";
import { toSrt, toVtt } from "@/lib/subtitles";

export const Route = createFileRoute("/api/projects/$id/subtitles/$lang")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const found = await memberProject(request, params.id);
        if (found instanceof Response) return found;
        const { project } = found;
        const lang = params.lang;
        if (lang !== "source" && !targetLangs(project).includes(lang)) return notFoundResponse();
        const segments = await listSegments(project.id);
        const texts =
          lang === "source"
            ? null
            : new Map((await listTranslations(project.id, lang)).map((t) => [t.segmentId, t.text]));
        const cues = segments
          .map((s) => ({ start: s.start, end: s.end, text: texts ? (texts.get(s.id) ?? "") : s.text }))
          .filter((cue) => cue.text.trim());
        const vtt = new URL(request.url).searchParams.get("format") === "vtt";
        const name = `${project.name.replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "subtitles"}-${lang}`;
        return new Response(vtt ? toVtt(cues) : toSrt(cues), {
          headers: {
            "content-type": vtt ? "text/vtt; charset=utf-8" : "application/x-subrip; charset=utf-8",
            "content-disposition": `attachment; filename="${encodeURIComponent(name)}.${vtt ? "vtt" : "srt"}"`,
            "cache-control": "private, no-store",
          },
        });
      },
    },
  },
});
