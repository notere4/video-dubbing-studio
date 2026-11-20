import { createFileRoute } from "@tanstack/react-router";
import { memberProject, notFoundResponse, serveObject } from "@/server/http";
import { listTranslations } from "@/server/projects";

export const Route = createFileRoute("/api/projects/$id/clips/$lang/$segmentId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const found = await memberProject(request, params.id);
        if (found instanceof Response) return found;
        const line = (await listTranslations(found.project.id, params.lang)).find(
          (t) => t.segmentId === params.segmentId,
        );
        if (!line?.clipKey) return notFoundResponse();
        return serveObject(request, line.clipKey);
      },
    },
  },
});
