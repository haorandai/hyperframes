import type { Context } from "hono";

export const projectDirMissing = (c: {
  json: (data: { error: string; why: string }, status: 404) => Response;
}) => c.json({ error: "not found", why: "project_dir_missing" }, 404);

/** Swaps a failed response for the 404 outright, so none of the route's headers (ETag, Content-Range) ride on it. */
export function replaceWithProjectDirMissing(c: Context): void {
  c.res = undefined;
  c.res = Response.json({ error: "not found", why: "project_dir_missing" }, { status: 404 });
}
