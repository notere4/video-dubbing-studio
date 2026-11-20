import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { integrationFetch } from "@every-app/sdk/server";
import { saveClonedVoice } from "@/server/editor";
import { memberProject, readBody } from "@/server/http";

// Clones a speaker's voice from a sample the browser cut from their lines.
export const Route = createFileRoute("/api/projects/$id/voices")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const found = await memberProject(request, params.id);
        if (found instanceof Response) return found;
        const speaker = new URL(request.url).searchParams.get("speaker")?.trim();
        if (!speaker || speaker.length > 60) return Response.json({ error: "Name the speaker." }, { status: 400 });
        const sample = await readBody(request, 20 * 1024 * 1024);
        if (!sample || sample.byteLength < 1000)
          return Response.json({ error: "The voice sample is too short or too large." }, { status: 400 });
        const form = new FormData();
        form.append("name", `${found.project.name} – ${speaker}`.slice(0, 100));
        form.append("files", new Blob([sample], { type: "audio/wav" }), "sample.wav");
        let response: Response;
        try {
          response = await integrationFetch({ env, provider: "elevenlabs" })(
            "https://api.elevenlabs.io/v1/voices/add",
            { method: "POST", body: form },
          );
        } catch {
          return Response.json({ error: "Voice cloning is off." }, { status: 503 });
        }
        if (!response.ok) {
          const off = response.status === 503 || response.status === 403;
          return Response.json(
            { error: off ? "Voice cloning is off." : `Cloning failed (${response.status}).` },
            { status: off ? 503 : 502 },
          );
        }
        const { voice_id } = (await response.json()) as { voice_id?: string };
        if (!voice_id) return Response.json({ error: "Cloning failed." }, { status: 502 });
        await saveClonedVoice(found.project.id, speaker, voice_id);
        return Response.json({ ok: true });
      },
    },
  },
});
