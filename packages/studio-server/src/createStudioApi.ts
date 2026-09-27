import { existsSync } from "node:fs";
import { Hono } from "hono";
import type { StudioApiAdapter } from "./types.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerFileRoutes } from "./routes/files.js";
import { registerPreviewRoutes } from "./routes/preview.js";
import { registerLintRoutes } from "./routes/lint.js";
import { registerRenderRoutes } from "./routes/render.js";
import { registerImageThumbnailRoutes } from "./routes/imageThumbnail.js";
import { registerThumbnailRoutes } from "./routes/thumbnail.js";
import { registerWaveformRoutes } from "./routes/waveform.js";
import { registerFontRoutes } from "./routes/fonts.js";
import { registerRegistryRoutes } from "./routes/registry.js";
import { registerSelectionRoutes } from "./routes/selection.js";
import { registerMediaRoutes } from "./routes/media.js";
import { registerGlobalAssetRoutes } from "./routes/globalAssets.js";
import { registerHistoryRoutes } from "./routes/history.js";
import { replaceWithProjectDirMissing } from "./helpers/projectDirMissing.js";
import { isProjectRootMissing } from "./helpers/safePath.js";

/**
 * Create a Hono sub-app with all studio API routes.
 *
 * Both the vite dev server and CLI embedded server mount this app
 * under /api, each providing their own adapter for host-specific behavior.
 */
export function createStudioApi(adapter: StudioApiAdapter): Hono {
  const api = new Hono();
  api.use(async function answerProjectDirMissingAfterErrorHandlers(c, next) {
    await next();
    if (isProjectRootMissing(c.error)) replaceWithProjectDirMissing(c);
  });
  // A project request that fails after its folder vanished answers that the folder is gone.
  api.use("/projects/:id/*", async function answerProjectDirMissingForVanishedFolder(c, next) {
    // Looked up first: once the folder is gone, some hosts no longer resolve the project.
    // ponytail: one extra lookup per project request; memoize per request if an adapter makes it costly.
    let dir: string | undefined;
    try {
      dir = (await adapter.resolveProject(c.req.param("id")))?.dir;
    } catch {
      // The route runs its own lookup and reports that failure.
    }
    await next();
    if (c.res.status >= 403 && dir && !existsSync(dir)) replaceWithProjectDirMissing(c);
  });

  registerProjectRoutes(api, adapter);
  registerFileRoutes(api, adapter);
  registerPreviewRoutes(api, adapter);
  registerLintRoutes(api, adapter);
  registerRenderRoutes(api, adapter);
  registerThumbnailRoutes(api, adapter);
  registerImageThumbnailRoutes(api, adapter);
  registerSelectionRoutes(api, adapter);
  registerMediaRoutes(api, adapter);
  registerWaveformRoutes(api, adapter);
  registerFontRoutes(api);
  registerRegistryRoutes(api, adapter);
  registerGlobalAssetRoutes(api);
  registerHistoryRoutes(api, adapter);

  return api;
}
