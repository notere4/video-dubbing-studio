export interface Cue {
  start: number;
  end: number;
  text: string;
}

function pad(value: number, width = 2) {
  return String(value).padStart(width, "0");
}

/** 3.5 → "00:00:03,500" (SRT) or "00:00:03.500" (VTT). */
export function subtitleTime(seconds: number, separator: "," | "."): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${pad(ms % 1000, 3)}`;
}

export function toSrt(cues: Cue[]): string {
  return cues
    .map(
      (cue, i) =>
        `${i + 1}\n${subtitleTime(cue.start, ",")} --> ${subtitleTime(cue.end, ",")}\n${cue.text}\n`,
    )
    .join("\n");
}

export function toVtt(cues: Cue[]): string {
  return `WEBVTT\n\n${cues
    .map(
      (cue) =>
        `${subtitleTime(cue.start, ".")} --> ${subtitleTime(cue.end, ".")}\n${cue.text}\n`,
    )
    .join("\n")}`;
}

function parseTime(value: string): number | null {
  const match = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/.exec(
    value.trim(),
  );
  if (!match) return null;
  const [, h = "0", m, s, ms] = match;
  return (
    Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms!.padEnd(3, "0")) / 1000
  );
}

/** The cues of an SRT file, in order. Throws when there are none. */
export function parseSrt(input: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = input
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.split("\n").filter((line) => line.trim() !== "");
    const timing = lines.findIndex((line) => line.includes("-->"));
    if (timing === -1) continue;
    const [from, to] = lines[timing]!.split("-->");
    const start = parseTime(from ?? "");
    const end = parseTime((to ?? "").trim().split(/\s+/)[0] ?? "");
    if (start === null || end === null || end <= start) continue;
    const text = lines
      .slice(timing + 1)
      .join("\n")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (text) cues.push({ start, end, text });
  }
  if (cues.length === 0) throw new Error("No subtitles found in that file.");
  return cues.sort((a, b) => a.start - b.start);
}

/** 63.25 → "01:03.250", the editor's timecode. */
export function formatTimecode(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${pad(m)}:${pad(s)}.${pad(ms % 1000, 3)}`;
}

/** "01:03.250", "1:03" or "63.25" → seconds; null when unreadable. */
export function parseTimecode(value: string): number | null {
  const match = /^(?:(\d+):)?(\d+(?:\.\d{1,3})?)$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1] ?? 0) * 60 + Number(match[2]);
}

/** 366 → "6:06", a duration in the list. */
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
