import { createServerFn } from "@tanstack/react-start";
import { notFound } from "@tanstack/react-router";
import { memberMiddleware } from "@/middleware/member";
import * as terms from "@/server/terms";

export const getTerms = createServerFn()
  .middleware([memberMiddleware])
  .handler(({ context }) => terms.listTerms(context.user.id));

export const createTerm = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => terms.createTermInput.parse(data))
  .handler(({ data, context }) => terms.createTerm(context.user.id, data));

export const updateTerm = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => terms.updateTermInput.parse(data))
  .handler(async ({ data, context }) => {
    const row = await terms.updateTerm(context.user.id, data);
    if (!row) throw notFound();
    return row;
  });

export const deleteTerm = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => terms.deleteTermInput.parse(data))
  .handler(async ({ data, context }) => {
    const row = await terms.deleteTerm(context.user.id, data.id);
    if (!row) throw notFound();
    return row;
  });
