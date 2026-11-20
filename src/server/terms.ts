import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { terms } from "@/db/schema";
import { LANGUAGE_CODES } from "@/lib/languages";

const fields = {
  source: z.string().trim().min(1, "Enter a term").max(200),
  lang: z.enum(LANGUAGE_CODES as [string, ...string[]]),
  translation: z.string().trim().max(200).nullable(),
  keepAsIs: z.boolean(),
};
const approved = (term: { translation: string | null; keepAsIs: boolean }) =>
  term.keepAsIs || !!term.translation;
const needsWording = "Enter the approved translation or keep the term as is";

export const createTermInput = z.object(fields).strict().refine(approved, needsWording);
export const updateTermInput = z
  .object({ id: z.string().uuid(), ...fields })
  .strict()
  .refine(approved, needsWording);
export const deleteTermInput = z.object({ id: z.string().uuid() }).strict();

export function listTerms(userId: string, lang?: string) {
  return db
    .select()
    .from(terms)
    .where(
      lang
        ? and(eq(terms.userId, userId), eq(terms.lang, lang))
        : eq(terms.userId, userId),
    )
    .orderBy(asc(terms.lang), asc(terms.source));
}

export async function createTerm(
  userId: string,
  input: z.infer<typeof createTermInput>,
) {
  const [row] = await db
    .insert(terms)
    .values({
      id: crypto.randomUUID(),
      userId,
      ...input,
      translation: input.keepAsIs ? null : input.translation,
    })
    .returning();
  return row!;
}

export async function updateTerm(
  userId: string,
  { id, ...input }: z.infer<typeof updateTermInput>,
) {
  const [row] = await db
    .update(terms)
    .set({ ...input, translation: input.keepAsIs ? null : input.translation })
    .where(and(eq(terms.id, id), eq(terms.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteTerm(userId: string, id: string) {
  const [row] = await db
    .delete(terms)
    .where(and(eq(terms.id, id), eq(terms.userId, userId)))
    .returning({ id: terms.id });
  return row ?? null;
}
