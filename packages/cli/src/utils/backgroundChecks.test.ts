import { existsSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ dev: false }));
vi.mock("./env.js", () => ({ isDevMode: () => env.dev }));
vi.mock("../telemetry/config.js", () => ({
  readConfig: () => ({}),
  readConfigFresh: () => ({}),
  writeConfig: () => true,
}));
const child = vi.hoisted(() => ({ on: vi.fn(), unref: vi.fn() }));
const spawn = vi.hoisted(() => vi.fn(() => child));
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn,
}));

const { launchBackgroundChecks } = await import("./backgroundChecks.js");

/** The checks handed to the child, or null when none was spawned. */
function spawnedChecks(): string[] | null {
  const call = spawn.mock.calls[0] as unknown as [string, string[]] | undefined;
  return call ? call[1].slice(call[1].indexOf(workerPath(call[1])) + 1) : null;
}

function workerPath(args: string[]): string {
  return args.find((a) => /backgroundChecksWorker\.[jt]s$/.test(a)) ?? "";
}

describe("launchBackgroundChecks", () => {
  let origTTY: boolean | undefined;
  beforeEach(() => {
    spawn.mockClear();
    env.dev = false;
    for (const name of ["CI", "HYPERFRAMES_NO_UPDATE_CHECK", "HYPERFRAMES_SKIP_SKILLS"]) {
      vi.stubEnv(name, "");
    }
    origTTY = process.stderr.isTTY;
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    Object.defineProperty(process.stderr, "isTTY", { value: origTTY, configurable: true });
  });

  it("runs both stale checks in one detached child the parent does not wait for", () => {
    launchBackgroundChecks();
    expect(spawn).toHaveBeenCalledTimes(1);
    const [execPath, args, opts] = spawn.mock.calls[0] as unknown as [
      string,
      string[],
      Record<string, unknown>,
    ];
    expect(execPath).toBe(process.execPath);
    expect(existsSync(workerPath(args))).toBe(true);
    expect(spawnedChecks()).toEqual(["update", "skills"]);
    expect(opts).toMatchObject({ detached: true, stdio: "ignore" });
    expect(child.unref).toHaveBeenCalled();
    expect(child.on).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it.each([
    ["dev mode", () => (env.dev = true), null],
    ["CI=1", () => vi.stubEnv("CI", "1"), null],
    ["CI=true", () => vi.stubEnv("CI", "true"), null],
    ["HYPERFRAMES_NO_UPDATE_CHECK=1", () => vi.stubEnv("HYPERFRAMES_NO_UPDATE_CHECK", "1"), null],
    ["HYPERFRAMES_SKIP_SKILLS=1", () => vi.stubEnv("HYPERFRAMES_SKIP_SKILLS", "1"), ["update"]],
    [
      "no terminal",
      () => Object.defineProperty(process.stderr, "isTTY", { value: false, configurable: true }),
      ["update"],
    ],
  ])("with %s, hands the child only what the parent used to check", (_, arrange, checks) => {
    arrange();
    launchBackgroundChecks();
    expect(spawnedChecks()).toEqual(checks);
  });
});
