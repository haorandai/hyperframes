import { expect, it, vi } from "vitest";

const telemetry = vi.hoisted(() => ({
  trackCliError: vi.fn(),
  // Never settles: waiting on it would hang the failing command.
  flush: vi.fn(() => new Promise<void>(() => {})),
}));
vi.mock("../../telemetry/index.js", () => telemetry);
vi.mock("../../ui/format.js", () => ({ errorBox: vi.fn() }));

it("records the failure and fails the command without waiting on the network", async () => {
  const { withFigmaErrors } = await import("./cliError.js");
  await expect(
    withFigmaErrors("figma tokens", async () => {
      throw new Error("boom");
    }),
  ).rejects.toThrow("Command failed");
  expect(telemetry.trackCliError).toHaveBeenCalledWith(
    expect.objectContaining({ error_message: "boom", command: "figma tokens" }),
  );
});
