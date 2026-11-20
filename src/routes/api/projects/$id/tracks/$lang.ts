import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { memberProject, notFoundResponse, readBody, serveObject } from "@/server/http";
import { getTrack, setTrackState, trackKey } from "@/server/projects";

// The dubbed audio track, mixed in the browser from the spoken clips.
export const Route = createFileRoute("/api/projects/$id/tracks/$lang")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const found = await memberProject(request, params.id);
        if (found instanceof Response) return found;
        const track = await getTrack(found.project.id, params.lang);
        if (!track) return notFoundResponse();
        const response = await serveObject(request, trackKey(found.project.id, params.lang), "audio/wav");
        if (new URL(request.url).searchParams.has("download") && response.ok) {
          const headers = new Headers(response.headers);
          const name = found.project.name.replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "dub";
          headers.set("content-disposition", `attachment; filename="${encodeURIComponent(`${name}-${params.lang}`)}.wav"`);
          return new Response(response.body, { status: response.status, headers });
        }
        return response;
      },
      PUT: async ({ request, params }) => {
        const found = await memberProject(request, params.id);
        if (found instanceof Response) return found;
        const track = await getTrack(found.project.id, params.lang);
        if (!track) return notFoundResponse();
        const revision = Number(new URL(request.url).searchParams.get("revision"));
        if (track.status !== "dubbed" || revision !== track.revision)
          return Response.json({ error: "stale" }, { status: 409 });
        const bytes = await readBody(request, 400 * 1024 * 1024);
        if (!bytes) return Response.json({ error: "too_large" }, { status: 413 });
        await env.media.put(trackKey(found.project.id, params.lang), bytes, {
          httpMetadata: { contentType: "audio/wav" },
        });
        await setTrackState(found.project.id, params.lang, { mixedRevision: revision });
        return Response.json({ ok: true });
      },
    },
  },
});
