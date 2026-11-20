import { env } from "cloudflare:workers";
import { getEveryAppUser } from "@every-app/sdk/server";
import { getProject, type Project } from "@/server/projects";
import { rememberUser } from "@/server/users";

export function notFoundResponse() {
  return Response.json({ error: "not_found" }, { status: 404 });
}

/** The signed-in member's project, or the response to send instead. */
export async function memberProject(
  request: Request,
  id: string,
): Promise<{ project: Project; userId: string } | Response> {
  const user = await getEveryAppUser(request, env);
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });
  await rememberUser(user);
  if (!/^[0-9a-f-]{36}$/.test(id)) return notFoundResponse();
  const project = await getProject(user.id, id);
  return project ? { project, userId: user.id } : notFoundResponse();
}

/** An R2 object as a response, honouring a single byte range so players can seek. */
export async function serveObject(request: Request, key: string, type?: string) {
  const head = await env.media.head(key);
  if (!head) return notFoundResponse();
  const size = head.size;
  const contentType = type ?? head.httpMetadata?.contentType ?? "application/octet-stream";
  const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (match && (match[1] || match[2])) {
    let start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    let end = match[1] && match[2] ? Number(match[2]) : size - 1;
    end = Math.min(end, size - 1);
    if (start > end || start >= size)
      return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    const object = await env.media.get(key, { range: { offset: start, length: end - start + 1 } });
    if (!object) return notFoundResponse();
    return new Response(object.body, {
      status: 206,
      headers: {
        "content-type": contentType,
        "content-range": `bytes ${start}-${end}/${size}`,
        "content-length": String(end - start + 1),
        "accept-ranges": "bytes",
        "cache-control": "private, no-store",
      },
    });
  }
  const object = await env.media.get(key);
  if (!object) return notFoundResponse();
  return new Response(object.body, {
    headers: {
      "content-type": contentType,
      "content-length": String(size),
      "accept-ranges": "bytes",
      "cache-control": "private, no-store",
    },
  });
}

/** The request body, refused above a size. */
export async function readBody(request: Request, limit: number) {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > limit) return null;
  const bytes = new Uint8Array(await request.arrayBuffer());
  return bytes.byteLength > limit ? null : bytes;
}
