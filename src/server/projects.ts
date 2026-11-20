import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { db } from "@/db";
import {
  projects,
  segments,
  speakers,
  tracks,
  translations,
} from "@/db/schema";
import { LANGUAGE_CODES } from "@/lib/languages";

const lang = z.enum(LANGUAGE_CODES as [string, ...string[]]);

export const createProjectInput = z
  .object({
    name: z.string().trim().min(1, "Give the project a name").max(120),
    sourceLang: z.union([z.literal("auto"), lang]),
    targetLangs: z.array(lang).min(1, "Pick at least one language").max(10),
    durationSec: z.number().min(0).max(6 * 3600),
    mediaType: z.string().max(100),
    audioChunks: z.number().int().min(1).max(400),
  })
  .strict()
  .refine(
    (input) => !input.targetLangs.includes(input.sourceLang),
    "A target language can't be the source language",
  );
export const projectIdInput = z.object({ id: z.string().uuid() }).strict();
export const renameProjectInput = z
  .object({ id: z.string().uuid(), name: z.string().trim().min(1).max(120) })
  .strict();

export type Project = typeof projects.$inferSelect;

export function mediaKey(projectId: string) {
  return `projects/${projectId}/media`;
}
export function audioKey(projectId: string, index: number) {
  return `projects/${projectId}/audio/${index}.wav`;
}
export function trackKey(projectId: string, lang: string) {
  return `projects/${projectId}/tracks/${lang}.wav`;
}

export function targetLangs(project: Pick<Project, "targetLangs">): string[] {
  return JSON.parse(project.targetLangs) as string[];
}

export function listProjects(userId: string) {
  return db
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.createdAt), desc(projects.id));
}

/** The project, or null when this member has none with the id. */
export async function getProject(
  userId: string,
  id: string,
): Promise<Project | null> {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)));
  return project ?? null;
}

export async function createProject(
  userId: string,
  input: z.infer<typeof createProjectInput>,
) {
  const id = crypto.randomUUID();
  await db.batch([
    db.insert(projects).values({
      id,
      userId,
      name: input.name,
      sourceLang: input.sourceLang,
      targetLangs: JSON.stringify(input.targetLangs),
      durationSec: input.durationSec,
      mediaType: input.mediaType || "application/octet-stream",
      audioChunks: input.audioChunks,
    }),
    ...input.targetLangs.map((code) =>
      db.insert(tracks).values({ projectId: id, lang: code }),
    ),
  ]);
  return { id };
}

export async function renameProject(
  userId: string,
  { id, name }: z.infer<typeof renameProjectInput>,
) {
  const [row] = await db
    .update(projects)
    .set({ name })
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .returning({ id: projects.id });
  return row ?? null;
}

/** Deletes the project with its segments, translations, voices and files. */
export async function deleteProject(userId: string, id: string) {
  const project = await getProject(userId, id);
  if (!project) return null;
  await db.batch([
    db.delete(translations).where(eq(translations.projectId, id)),
    db.delete(segments).where(eq(segments.projectId, id)),
    db.delete(speakers).where(eq(speakers.projectId, id)),
    db.delete(tracks).where(eq(tracks.projectId, id)),
    db.delete(projects).where(eq(projects.id, id)),
  ]);
  let cursor: string | undefined;
  do {
    const listed = await env.media.list({ prefix: `projects/${id}/`, cursor });
    if (listed.objects.length)
      await env.media.delete(listed.objects.map((object) => object.key));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  return { id };
}

export async function setProjectState(
  id: string,
  state: Partial<Pick<Project, "status" | "progress" | "error" | "detectedLang">>,
) {
  await db.update(projects).set(state).where(eq(projects.id, id));
}

export function listSegments(projectId: string) {
  return db
    .select()
    .from(segments)
    .where(eq(segments.projectId, projectId))
    .orderBy(asc(segments.position));
}

export function listTranslations(projectId: string, lang?: string) {
  return db
    .select()
    .from(translations)
    .where(
      lang
        ? and(eq(translations.projectId, projectId), eq(translations.lang, lang))
        : eq(translations.projectId, projectId),
    );
}

export function listTracks(projectId: string) {
  return db.select().from(tracks).where(eq(tracks.projectId, projectId));
}

export async function getTrack(projectId: string, lang: string) {
  const [track] = await db
    .select()
    .from(tracks)
    .where(and(eq(tracks.projectId, projectId), eq(tracks.lang, lang)));
  return track ?? null;
}

export async function setTrackState(
  projectId: string,
  lang: string,
  state: Partial<typeof tracks.$inferInsert>,
) {
  await db
    .update(tracks)
    .set(state)
    .where(and(eq(tracks.projectId, projectId), eq(tracks.lang, lang)));
}

/** The speakers in a project's segments, with their voice settings. */
export async function listSpeakers(projectId: string) {
  const [rows, settings] = await Promise.all([
    db
      .selectDistinct({ name: segments.speaker })
      .from(segments)
      .where(eq(segments.projectId, projectId)),
    db.select().from(speakers).where(eq(speakers.projectId, projectId)),
  ]);
  return rows
    .map((row) => row.name)
    .sort()
    .map(
      (name) =>
        settings.find((s) => s.name === name) ?? {
          projectId,
          name,
          voice: "standard",
          speed: 1,
          similarity: 0.75,
          clonedVoiceId: null,
        },
    );
}

/** After a dub run, what the project as a whole is doing. */
export async function settleProjectStatus(projectId: string) {
  const rows = await listTracks(projectId);
  const busy = rows.some((t) => t.status === "dubbing");
  const translating = rows.some((t) => t.status === "translating");
  const allDubbed = rows.length > 0 && rows.every((t) => t.status === "dubbed");
  const status = busy
    ? "dubbing"
    : translating
      ? "translating"
      : allDubbed
        ? "done"
        : "ready";
  await db
    .update(projects)
    .set({ status, error: null, progress: 100 })
    .where(and(eq(projects.id, projectId), inArray(projects.status, ["ready", "dubbing", "done", "translating"])));
}
