import { and, eq, isNull, or } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { db } from "@/db";
import { projects, segments, translations, tracks } from "@/db/schema";
import { audioType, speak, transcribe, translate } from "@/server/ai";
import {
  audioKey,
  listSegments,
  listSpeakers,
  listTranslations,
  setProjectState,
  setTrackState,
  settleProjectStatus,
  targetLangs,
  type Project,
} from "@/server/projects";
import { listTerms } from "@/server/terms";

/** The seconds of audio in each chunk the browser uploads. */
export const CHUNK_SECONDS = 60;

export type Job =
  | { kind: "process"; projectId: string }
  | { kind: "translate"; projectId: string; lang: string }
  | { kind: "dub"; projectId: string; lang: string };

export function enqueue(job: Job) {
  return env.JOBS.send(job);
}

async function loadProject(id: string): Promise<Project | null> {
  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  return project ?? null;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** Runs one job; failures land on the project or track for the page to show. */
export async function runJob(job: Job) {
  const project = await loadProject(job.projectId);
  if (!project) return;
  if (job.kind === "process") {
    try {
      await processProject(project);
    } catch (error) {
      await setProjectState(project.id, { status: "failed", error: message(error) });
    }
  } else if (job.kind === "translate") {
    try {
      await translateTrack(project, job.lang, false);
      await setTrackState(project.id, job.lang, { status: "idle", error: null });
    } catch (error) {
      await setTrackState(project.id, job.lang, { status: "failed", error: message(error) });
    }
    await settleProjectStatus(project.id);
  } else {
    try {
      await dubTrack(project, job.lang);
    } catch (error) {
      await setTrackState(project.id, job.lang, { status: "failed", error: message(error) });
    }
    await settleProjectStatus(project.id);
  }
}

/** Transcribes (unless already done) and translates every target language. */
async function processProject(project: Project) {
  let existing = await listSegments(project.id);
  let language = project.sourceLang === "auto" ? project.detectedLang : project.sourceLang;
  if (existing.length === 0) {
    await setProjectState(project.id, { status: "transcribing", progress: 0, error: null });
    const found: { start: number; end: number; text: string }[] = [];
    for (let i = 0; i < project.audioChunks; i++) {
      const object = await env.media.get(audioKey(project.id, i));
      if (!object) throw new Error("The uploaded audio is missing. Delete the project and upload it again.");
      const result = await transcribe(
        new Uint8Array(await object.arrayBuffer()),
        i * CHUNK_SECONDS,
        project.sourceLang === "auto" ? null : project.sourceLang,
      );
      if (!language && result.language) language = result.language;
      found.push(...result.segments);
      await setProjectState(project.id, {
        progress: Math.round(((i + 1) / project.audioChunks) * 100),
      });
    }
    if (found.length === 0) throw new Error("No speech was found in this file.");
    const rows = found.map((s, position) => ({
      id: crypto.randomUUID(),
      projectId: project.id,
      position,
      start: s.start,
      end: s.end,
      text: s.text,
      speaker: "Speaker 1",
    }));
    for (let i = 0; i < rows.length; i += 20)
      await db.insert(segments).values(rows.slice(i, i + 20));
    if (project.sourceLang === "auto")
      await setProjectState(project.id, { detectedLang: language });
    existing = await listSegments(project.id);
  }
  await setProjectState(project.id, { status: "translating", progress: 0, error: null });
  const langs = targetLangs(project);
  for (const [i, lang] of langs.entries()) {
    await translateTrack({ ...project, detectedLang: language }, lang, true, (done) =>
      setProjectState(project.id, {
        progress: Math.round(((i + done) / langs.length) * 100),
      }),
    );
  }
  await setProjectState(project.id, { status: "ready", progress: 100, error: null });
}

/**
 * Translates a language track. `missingOnly` keeps lines already
 * translated (a retry after a failure); otherwise every line is redone.
 */
export async function translateTrack(
  project: Project,
  lang: string,
  missingOnly: boolean,
  onProgress?: (fraction: number) => Promise<void>,
) {
  const from = project.sourceLang === "auto" ? project.detectedLang : project.sourceLang;
  const [lines, done, glossary] = await Promise.all([
    listSegments(project.id),
    listTranslations(project.id, lang),
    listTerms(project.userId, lang),
  ]);
  for (const [i, line] of lines.entries()) {
    const current = done.find((t) => t.segmentId === line.id);
    if (missingOnly && current) continue;
    const text = await translate(line.text, from, lang, glossary);
    await saveTranslation(project.id, line.id, lang, text, !!current?.clipKey);
    if (onProgress && i % 5 === 4) await onProgress((i + 1) / lines.length);
  }
}

export async function saveTranslation(
  projectId: string,
  segmentId: string,
  lang: string,
  text: string,
  hasClip: boolean,
) {
  await db
    .insert(translations)
    .values({ projectId, segmentId, lang, text })
    .onConflictDoUpdate({
      target: [translations.segmentId, translations.lang],
      set: { text, ...(hasClip ? { needsRedub: true } : {}) },
    });
}

/** Speaks every line with no clip yet or marked as changed, then bumps the track's revision. */
async function dubTrack(project: Project, lang: string) {
  const [lines, voices] = await Promise.all([
    db
      .select()
      .from(translations)
      .where(
        and(
          eq(translations.projectId, project.id),
          eq(translations.lang, lang),
          or(isNull(translations.clipKey), eq(translations.needsRedub, true)),
        ),
      ),
    listSpeakers(project.id),
  ]);
  const owners = await listSegments(project.id);
  for (const [i, line] of lines.entries()) {
    const segment = owners.find((s) => s.id === line.segmentId);
    if (!segment) continue;
    const voice = voices.find((v) => v.name === segment.speaker) ?? voices[0]!;
    const key = `projects/${project.id}/clips/${lang}/${line.segmentId}-${crypto.randomUUID()}`;
    if (line.text.trim()) {
      const bytes = await speak(line.text, lang, voice, project.userId);
      await env.media.put(key, bytes, { httpMetadata: { contentType: audioType(bytes) } });
    }
    if (line.clipKey) await env.media.delete(line.clipKey);
    await db
      .update(translations)
      .set({ clipKey: line.text.trim() ? key : null, needsRedub: false })
      .where(and(eq(translations.segmentId, line.segmentId), eq(translations.lang, lang)));
    await setTrackState(project.id, lang, {
      progress: Math.round(((i + 1) / lines.length) * 100),
    });
  }
  const [track] = await db
    .select()
    .from(tracks)
    .where(and(eq(tracks.projectId, project.id), eq(tracks.lang, lang)));
  await setTrackState(project.id, lang, {
    status: "dubbed",
    error: null,
    progress: 100,
    revision: (track?.revision ?? 0) + 1,
  });
}
