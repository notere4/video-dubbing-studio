import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { memberProject, serveObject } from "@/server/http";
import { mediaKey } from "@/server/projects";

const MAX_MEDIA_BYTES = 500 * 1024 * 1024;

export const Route = createFileRoute("/api/projects/$id/media")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const found = await memberProject(request, params.id);
        if (found instanceof Response) return found;
        return serveObject(request, mediaKey(found.project.id), found.project.mediaType);
      },
      PUT: async ({ request, params }) => {
        const found = await memberProject(request, params.id);
        if (found instanceof Response) return found;
        if (found.project.status !== "uploaded")
          return Response.json({ error: "already_processing" }, { status: 409 });
        const length = Number(request.headers.get("content-length") ?? "0");
        if (!request.body || !length || length > MAX_MEDIA_BYTES)
          return Response.json({ error: "Files up to 500 MB can be uploaded." }, { status: 413 });
        await env.media.put(mediaKey(found.project.id), request.body, {
          httpMetadata: { contentType: found.project.mediaType },
        });
        await db.update(projects).set({ mediaUploaded: true }).where(eq(projects.id, found.project.id));
        return Response.json({ ok: true });
      },
    },
  },
});
