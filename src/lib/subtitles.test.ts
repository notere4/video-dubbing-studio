import { describe, expect, it } from "vitest";
import { protectTerms } from "./glossary";
import {
  formatTimecode,
  parseSrt,
  parseTimecode,
  toSrt,
  toVtt,
} from "./subtitles";

describe("subtitles", () => {
  const cues = [
    { start: 0, end: 1.9, text: "Hola" },
    { start: 62.5, end: 64, text: "Adios" },
  ];
  it("writes SRT and VTT", () => {
    expect(toSrt(cues)).toContain("2\n00:01:02,500 --> 00:01:04,000\nAdios");
    expect(toVtt(cues)).toMatch(/^WEBVTT\n\n00:00:00.000 --> 00:00:01.900/);
  });
  it("reads back what it writes", () => {
    expect(parseSrt(toSrt(cues))).toEqual(cues);
  });
  it("refuses a file with no cues", () => {
    expect(() => parseSrt("hello")).toThrow();
  });
  it("reads editor timecodes", () => {
    expect(formatTimecode(63.25)).toBe("01:03.250");
    expect(parseTimecode("01:03.250")).toBe(63.25);
    expect(parseTimecode("abc")).toBeNull();
  });
});

describe("glossary", () => {
  it("puts the approved translation back", () => {
    const { text, restore } = protectTerms("Bake the Sourdough today", [
      { source: "sourdough", translation: "masa madre", keepAsIs: false },
    ]);
    expect(text).toBe("Bake the [[1]] today");
    expect(restore("Hornea la [[1]] hoy")).toBe("Hornea la masa madre hoy");
  });
  it("keeps a term as is and adds it back when the marker is lost", () => {
    const { restore } = protectTerms("Open Acme now", [
      { source: "Acme", translation: null, keepAsIs: true },
    ]);
    expect(restore("Abre ahora")).toBe("Abre ahora Acme");
  });
});
