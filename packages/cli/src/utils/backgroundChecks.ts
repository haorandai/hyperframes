import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { skillsCheckDue } from "./skillsUpdateCheck.js";
import { updateCheckDue } from "./updateCheck.js";

/** Refresh the due update and skills caches in a detached child, so this process never waits on it. */
export function launchBackgroundChecks(): void {
  const due = [updateCheckDue() && "update", skillsCheckDue() && "skills"].filter(
    (check): check is string => typeof check === "string",
  );
  if (due.length === 0) return;
  const sourceMode = import.meta.url.endsWith(".ts");
  const worker = new URL(
    sourceMode ? "../backgroundChecksWorker.ts" : "./backgroundChecksWorker.js",
    import.meta.url,
  );
  const execArgv = sourceMode ? ["--import", "tsx"] : [];
  try {
    const child = spawn(process.execPath, [...execArgv, fileURLToPath(worker), ...due], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("error", () => {});
    child.unref();
  } catch {
    // Best-effort: the next run tries again.
  }
}
