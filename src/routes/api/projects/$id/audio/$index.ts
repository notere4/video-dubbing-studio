import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { memberProject, readBody } from "@/server/http";
import { audioKey } from "@/server/projects";

// The browser's 16 kHz mono WAV chunks, which speech recognition reads.
export const Route = createFileRoute("/api/projects/$id/audio/$index")({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        const found = await memberProject(request, params.id);
        if (found instanceof Response) return found;
        const index = Number(params.index);
        if (!Number.isInteger(index) || index < 0 || index >= found.project.audioChunks)
          return Response.json({ error: "bad_chunk" }, { status: 400 });
        if (found.project.status !== "uploaded")
          return Response.json({ error: "already_processing" }, { status: 409 });
        const bytes = await readBody(request, 8 * 1024 * 1024);
        if (!bytes) return Response.json({ error: "too_large" }, { status: 413 });
        await env.media.put(audioKey(found.project.id, index), bytes, {
          httpMetadata: { contentType: "audio/wav" },
        });
        return Response.json({ ok: true });
      },
    },
  },
});
