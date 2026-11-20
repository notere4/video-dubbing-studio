export interface GlossaryEntry {
  source: string;
  translation: string | null;
  keepAsIs: boolean;
}

function escape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Swaps each listed term for a numbered marker ([[1]]) before translation,
 * so the model can't change it, and returns how to put the approved
 * wording back afterwards. Longer terms match first; matching ignores case
 * and stops at word edges.
 */
export function protectTerms(text: string, entries: GlossaryEntry[]) {
  const replacements: string[] = [];
  let protectedText = text;
  const sorted = [...entries]
    .filter((entry) => entry.source.trim())
    .sort((a, b) => b.source.length - a.source.length);
  for (const entry of sorted) {
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{N}])${escape(entry.source.trim())}(?![\\p{L}\\p{N}])`,
      "giu",
    );
    protectedText = protectedText.replace(pattern, (match) => {
      replacements.push(
        entry.keepAsIs || !entry.translation ? match : entry.translation,
      );
      return `[[${replacements.length}]]`;
    });
  }
  return {
    text: protectedText,
    restore(translated: string): string {
      let result = translated;
      replacements.forEach((value, i) => {
        const marker = new RegExp(`\\[\\[\\s*${i + 1}\\s*\\]\\]`, "g");
        result = marker.test(result)
          ? result.replace(marker, value)
          : `${result} ${value}`.trim();
      });
      return result;
    },
  };
}
