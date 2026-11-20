import { createServerFn } from "@tanstack/react-start";
import { notFound } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { integrationStatus } from "@every-app/sdk/server";
import { memberMiddleware } from "@/middleware/member";
import * as editor from "@/server/editor";
import { CHUNK_SECONDS, enqueue } from "@/server/jobs";
import * as projects from "@/server/projects";

export const getProjects = createServerFn()
  .middleware([memberMiddleware])
  .handler(async ({ context }) => {
    const rows = await projects.listProjects(context.user.id);
    return rows.map((p) => ({ ...p, targetLangs: projects.targetLangs(p) }));
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => projects.createProjectInput.parse(data))
  .handler(async ({ data, context }) => ({
    ...(await projects.createProject(context.user.id, data)),
    chunkSeconds: CHUNK_SECONDS,
  }));

/** Starts the background run once the files are in. Also the Retry after a failure. */
export const startProcessing = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => projects.projectIdInput.parse(data))
  .handler(async ({ data, context }) => {
    const project = await projects.getProject(context.user.id, data.id);
    if (!project) throw notFound();
    if (!project.mediaUploaded) throw new Error("The file hasn't finished uploading.");
    if (!["uploaded", "failed"].includes(project.status))
      throw new Error("This project is already being processed.");
    await projects.setProjectState(project.id, { status: "transcribing", progress: 0, error: null });
    await enqueue({ kind: "process", projectId: project.id });
    return { ok: true };
  });

export const renameProject = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => projects.renameProjectInput.parse(data))
  .handler(async ({ data, context }) => {
    const row = await projects.renameProject(context.user.id, data);
    if (!row) throw notFound();
    return row;
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => projects.projectIdInput.parse(data))
  .handler(async ({ data, context }) => {
    const row = await projects.deleteProject(context.user.id, data.id);
    if (!row) throw notFound();
    return row;
  });

async function voiceCloningReady() {
  try {
    const status = await integrationStatus({ env, provider: "elevenlabs" });
    return status.ready;
  } catch {
    return false;
  }
}

export const getProjectDetail = createServerFn()
  .middleware([memberMiddleware])
  .validator((data: unknown) => projects.projectIdInput.parse(data))
  .handler(async ({ data, context }) => {
    const project = await projects.getProject(context.user.id, data.id);
    if (!project) throw notFound();
    const [segments, translations, tracks, speakers, cloning] = await Promise.all([
      projects.listSegments(project.id),
      projects.listTranslations(project.id),
      projects.listTracks(project.id),
      projects.listSpeakers(project.id),
      voiceCloningReady(),
    ]);
    return {
      project: { ...project, targetLangs: projects.targetLangs(project) },
      segments: segments.map((s) => ({
        ...s,
        translations: Object.fromEntries(
          translations
            .filter((t) => t.segmentId === s.id)
            .map((t) => [t.lang, { text: t.text, dubbed: !!t.clipKey, needsRedub: t.needsRedub && !!t.clipKey }]),
        ) as Record<string, { text: string; dubbed: boolean; needsRedub: boolean }>,
      })),
      tracks,
      speakers: speakers.map(({ clonedVoiceId, ...s }) => ({ ...s, cloned: !!clonedVoiceId })),
      voiceCloning: cloning,
    };
  });

async function guarded<R>(work: () => Promise<R>): Promise<R> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof editor.NotFound) throw notFound();
    throw error;
  }
}

export const updateSegment = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => editor.updateSegmentInput.parse(data))
  .handler(({ data, context }) => guarded(() => editor.updateSegment(context.user.id, data)));

export const retranslateSegment = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => editor.segmentRefInput.parse(data))
  .handler(({ data, context }) => guarded(() => editor.retranslateSegment(context.user.id, data)));

export const retranslateTrack = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => editor.trackRefInput.parse(data))
  .handler(({ data, context }) => guarded(() => editor.retranslateTrack(context.user.id, data)));

export const startDub = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => editor.trackRefInput.parse(data))
  .handler(({ data, context }) => guarded(() => editor.startDub(context.user.id, data)));

export const updateSpeaker = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => editor.speakerInput.parse(data))
  .handler(({ data, context }) => guarded(() => editor.updateSpeaker(context.user.id, data)));

export const replaceFromSrt = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => editor.srtInput.parse(data))
  .handler(({ data, context }) => guarded(() => editor.replaceFromSrt(context.user.id, data)));
