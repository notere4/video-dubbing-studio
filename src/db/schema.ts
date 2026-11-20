import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`);

/** Members as the Gateway names them, recorded the first time each one opens the app. */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  createdAt: createdAt(),
});

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    /** A language code, or "auto" to detect it. */
    sourceLang: text("source_lang").notNull(),
    detectedLang: text("detected_lang"),
    /** JSON array of language codes. */
    targetLangs: text("target_langs").notNull(),
    durationSec: real("duration_sec").notNull().default(0),
    mediaType: text("media_type").notNull(),
    mediaUploaded: integer("media_uploaded", { mode: "boolean" })
      .notNull()
      .default(false),
    audioChunks: integer("audio_chunks").notNull().default(0),
    status: text("status").notNull().default("uploaded"),
    progress: integer("progress").notNull().default(0),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("projects_user").on(t.userId, t.createdAt)],
);

export const segments = sqliteTable(
  "segments",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    position: integer("position").notNull(),
    start: real("start").notNull(),
    end: real("end").notNull(),
    text: text("text").notNull(),
    speaker: text("speaker").notNull(),
  },
  (t) => [index("segments_project").on(t.projectId, t.position)],
);

export const translations = sqliteTable(
  "translations",
  {
    segmentId: text("segment_id").notNull(),
    projectId: text("project_id").notNull(),
    lang: text("lang").notNull(),
    text: text("text").notNull(),
    /** The R2 key of the spoken clip, once dubbed. */
    clipKey: text("clip_key"),
    needsRedub: integer("needs_redub", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (t) => [
    primaryKey({ columns: [t.segmentId, t.lang] }),
    index("translations_project").on(t.projectId, t.lang),
  ],
);

/** One per project and target language: the dub's state and its mixed audio. */
export const tracks = sqliteTable(
  "tracks",
  {
    projectId: text("project_id").notNull(),
    lang: text("lang").notNull(),
    /** idle, translating, dubbing, dubbed, failed */
    status: text("status").notNull().default("idle"),
    error: text("error"),
    progress: integer("progress").notNull().default(0),
    revision: integer("revision").notNull().default(0),
    mixedRevision: integer("mixed_revision").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.lang] })],
);

export const speakers = sqliteTable(
  "speakers",
  {
    projectId: text("project_id").notNull(),
    name: text("name").notNull(),
    /** A stock voice id, or "clone" for the speaker's cloned voice. */
    voice: text("voice").notNull().default("standard"),
    speed: real("speed").notNull().default(1),
    similarity: real("similarity").notNull().default(0.75),
    clonedVoiceId: text("cloned_voice_id"),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.name] })],
);

export const terms = sqliteTable(
  "terms",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    source: text("source").notNull(),
    lang: text("lang").notNull(),
    translation: text("translation"),
    keepAsIs: integer("keep_as_is", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: createdAt(),
  },
  (t) => [index("terms_user").on(t.userId, t.lang)],
);
