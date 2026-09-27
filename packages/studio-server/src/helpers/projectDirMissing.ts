import type { Context } from "hono";

const PROJECT_DIR_MISSING = { error: "not found", why: "project_dir_missing" };

export const projectDirMissing = (c: {
  json: (data: { error: string; why: string }, status: 404) => Response;
}) => c.json(PROJECT_DIR_MISSING, 404);

/** Swaps a failed response for the 404, keeping only the headers the host set before the route (not its ETag, Content-Range). */
export function replaceWithProjectDirMissing(c: Context, hostHeaders: Headers): void {
  hostHeaders.delete("content-type");
  c.res = undefined;
  c.res = Response.json(PROJECT_DIR_MISSING, { status: 404, headers: hostHeaders });
}
