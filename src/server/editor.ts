import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { db } from "@/db";
import { segments, speakers, tracks, translations } from "@/db/schema";
import { parseSrt } from "@/lib/subtitles";
import { translate } from "@/server/ai";
import { enqueue, saveTranslation } from "@/server/jobs";
import {
  getProject,
  getTrack,
  listSegments,
  listTranslations,
  setProjectState,
  setTrackState,
  targetLangs,
  type Project,
} from "@/server/projects";
import { listTerms } from "@/server/terms";

const id = z.string().uuid();
const code = z.string().min(2).max(5);

export const updateSegmentInput = z
  .object({
    projectId: id,
    segmentId: id,
    lang: code,
    text: z.string().max(2000),
    translation: z.string().max(2000),
    start: z.number().min(0),
    end: z.number().min(0),
    speaker: z.string().trim().min(1, "Name the speaker").max(60),
  })
  .strict()
  .refine((s) => s.end > s.start, "The end must come after the start");
export const segmentRefInput = z
  .object({ projectId: id, segmentId: id, lang: code })
  .strict();
export const trackRefInput = z.object({ projectId: id, lang: code }).strict();
export const speakerInput = z
  .object({
    projectId: id,
    name: z.string().min(1).max(60),
    voice: z.string().min(1).max(60),
    speed: z.number().min(0.5).max(2),
    similarity: z.number().min(0).max(1),
  })
  .strict();
export const srtInput = z
  .object({
    projectId: id,
    lang: z.union([z.literal("source"), code]),
    srt: z.string().min(1).max(2_000_000),
  })
  .strict();

class NotFound extends Error {
  constructor() {
    super("Not found");
  }
}

async function ownedProject(userId: string, projectId: string, lang?: string) {
  const project = await getProject(userId, projectId);
  if (!project) throw new NotFound();
  if (lang && lang !== "source" && !targetLangs(project).includes(lang))
    throw new NotFound();
  return project;
}

/** Saves one segment's edits and marks what has to be spoken again. */
export async function updateSegment(
  userId: string,
  input: z.infer<typeof updateSegmentInput>,
) {
  await ownedProject(userId, input.projectId, input.lang);
  const [segment] = await db
    .select()
    .from(segments)
    .where(and(eq(segments.id, input.segmentId), eq(segments.projectId, input.projectId)));
  if (!segment) throw new NotFound();
  const retimed =
    segment.start !== input.start ||
    segment.end !== input.end ||
    segment.speaker !== input.speaker;
  const [current] = await listTranslations(input.projectId, input.lang).then((rows) =>
    rows.filter((row) => row.segmentId === input.segmentId),
  );
  const statements = [
    db
      .update(segments)
      .set({ text: input.text, start: input.start, end: input.end, speaker: input.speaker })
      .where(eq(segments.id, input.segmentId)),
    db
      .insert(translations)
      .values({ projectId: input.projectId, segmentId: input.segmentId, lang: input.lang, text: input.translation })
      .onConflictDoUpdate({
        target: [translations.segmentId, translations.lang],
        set: {
          text: input.translation,
          ...(current?.clipKey && current.text !== input.translation ? { needsRedub: true } : {}),
        },
      }),
  ] as const;
  if (retimed) {
    await db.batch([
      ...statements,
      db
        .update(translations)
        .set({ needsRedub: true })
        .where(and(eq(translations.segmentId, input.segmentId), isNotNull(translations.clipKey))),
    ]);
  } else {
    await db.batch(statements);
  }
  return { ok: true };
}

/** Translates one segment again, now, with the current dictionary. */
export async function retranslateSegment(
  userId: string,
  input: z.infer<typeof segmentRefInput>,
) {
  const project = await ownedProject(userId, input.projectId, input.lang);
  const [segment] = await db
    .select()
    .from(segments)
    .where(and(eq(segments.id, input.segmentId), eq(segments.projectId, project.id)));
  if (!segment) throw new NotFound();
  const from = project.sourceLang === "auto" ? project.detectedLang : project.sourceLang;
  const text = await translate(segment.text, from, input.lang, await listTerms(userId, input.lang));
  const [current] = (await listTranslations(project.id, input.lang)).filter(
    (row) => row.segmentId === segment.id,
  );
  await saveTranslation(project.id, segment.id, input.lang, text, !!current?.clipKey);
  return { text };
}

async function markTranslating(project: Project, lang: string) {
  await setTrackState(project.id, lang, { status: "translating", error: null });
  await setProjectState(project.id, { status: "translating", error: null });
  await enqueue({ kind: "translate", projectId: project.id, lang });
}

export async function retranslateTrack(
  userId: string,
  input: z.infer<typeof trackRefInput>,
) {
  const project = await ownedProject(userId, input.projectId, input.lang);
  if (!["ready", "done"].includes(project.status))
    throw new Error("Wait until the project is ready.");
  await markTranslating(project, input.lang);
  return { ok: true };
}

export async function startDub(userId: string, input: z.infer<typeof trackRefInput>) {
  const project = await ownedProject(userId, input.projectId, input.lang);
  if (!["ready", "done", "dubbing"].includes(project.status))
    throw new Error("Wait until the project is ready.");
  const track = await getTrack(project.id, input.lang);
  if (track?.status === "dubbing" || track?.status === "translating")
    throw new Error("This language is already being worked on.");
  await setTrackState(project.id, input.lang, { status: "dubbing", error: null, progress: 0 });
  await setProjectState(project.id, { status: "dubbing", error: null });
  await enqueue({ kind: "dub", projectId: project.id, lang: input.lang });
  return { ok: true };
}

/** Saves a speaker's voice; their dubbed lines are marked to be spoken again. */
export async function updateSpeaker(userId: string, input: z.infer<typeof speakerInput>) {
  await ownedProject(userId, input.projectId);
  const settings = { voice: input.voice, speed: input.speed, similarity: input.similarity };
  const lines = await db
    .select({ id: segments.id })
    .from(segments)
    .where(and(eq(segments.projectId, input.projectId), eq(segments.speaker, input.name)));
  await db.batch([
    db
      .insert(speakers)
      .values({ projectId: input.projectId, name: input.name, ...settings })
      .onConflictDoUpdate({ target: [speakers.projectId, speakers.name], set: settings }),
    ...(lines.length
      ? [
          db
            .update(translations)
            .set({ needsRedub: true })
            .where(
              and(
                inArray(translations.segmentId, lines.map((l) => l.id)),
                isNotNull(translations.clipKey),
              ),
            ),
        ]
      : []),
  ]);
  return { ok: true };
}

export async function saveClonedVoice(projectId: string, name: string, voiceId: string) {
  await db
    .insert(speakers)
    .values({ projectId, name, voice: "clone", clonedVoiceId: voiceId })
    .onConflictDoUpdate({
      target: [speakers.projectId, speakers.name],
      set: { voice: "clone", clonedVoiceId: voiceId },
    });
}

/**
 * Replaces the segments with an SRT's cues. For the source track the cue
 * text becomes the source; for a language track it becomes that
 * language's translation and the source text is taken from the old lines
 * the cue covers. Other languages are translated again.
 */
export async function replaceFromSrt(userId: string, input: z.infer<typeof srtInput>) {
  const project = await ownedProject(userId, input.projectId, input.lang);
  if (!["ready", "done"].includes(project.status))
    throw new Error("Wait until the project is ready.");
  const cues = parseSrt(input.srt);
  const old = await listSegments(project.id);
  const rows = cues.map((cue, position) => {
    const covered = old.filter((s) => {
      const middle = (s.start + s.end) / 2;
      return middle >= cue.start && middle < cue.end;
    });
    return {
      id: crypto.randomUUID(),
      projectId: project.id,
      position,
      start: cue.start,
      end: cue.end,
      text: input.lang === "source" ? cue.text : covered.map((s) => s.text).join(" "),
      speaker: covered[0]?.speaker ?? old[0]?.speaker ?? "Speaker 1",
    };
  });
  const langs = targetLangs(project);
  await db.batch([
    db.delete(translations).where(eq(translations.projectId, project.id)),
    db.delete(segments).where(eq(segments.projectId, project.id)),
    db.update(tracks).set({ status: "idle", error: null, progress: 0, revision: 0, mixedRevision: 0 }).where(eq(tracks.projectId, project.id)),
  ]);
  for (let i = 0; i < rows.length; i += 15) await db.insert(segments).values(rows.slice(i, i + 15));
  if (input.lang !== "source") {
    const lang = input.lang;
    const values = rows.map((row, i) => ({
      projectId: project.id,
      segmentId: row.id,
      lang,
      text: cues[i]!.text,
    }));
    for (let i = 0; i < values.length; i += 15)
      await db.insert(translations).values(values.slice(i, i + 15));
  }
  const listed = await env.media.list({ prefix: `projects/${project.id}/clips/` });
  if (listed.objects.length) await env.media.delete(listed.objects.map((o) => o.key));
  for (const lang of langs) if (lang !== input.lang) await markTranslating(project, lang);
  return { segments: rows.length };
}

export { NotFound };
