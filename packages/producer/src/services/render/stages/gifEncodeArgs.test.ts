import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { buildGifPalettegenArgs, buildGifPaletteuseArgs } from "./gifEncodeArgs.js";

const ffmpeg = (args: string[]) => spawnSync("ffmpeg", args);

describe("GIF encode of RGB frames among RGBA frames", () => {
  it("encodes every frame without rebuilding the filter graph", () => {
    const dir = mkdtempSync(join(tmpdir(), "hf-gif-mixed-"));
    try {
      const frame = (i: number) => join(dir, `frame_${String(i).padStart(6, "0")}.png`);
      for (const [i, color, pixFmt] of [
        [1, "red@0.2", "rgba"],
        [2, "blue", "rgb24"],
      ] as const) {
        const lavfi = `color=c=${color}:s=64x36,format=rgba`;
        expect(
          ffmpeg(["-f", "lavfi", "-i", lavfi, "-frames:v", "1", "-pix_fmt", pixFmt, frame(i)])
            .status,
        ).toBe(0);
      }
      for (let i = 3; i <= 16; i++) copyFileSync(frame(2 - (i % 2)), frame(i));
      const args = {
        framesDir: dir,
        framePattern: "frame_%06d.png",
        palettePath: join(dir, "palette.png"),
        outputPath: join(dir, "out.gif"),
        fps: { num: 10, den: 1 },
        loop: 0,
        preserveAlpha: true,
      };
      expect(ffmpeg(buildGifPalettegenArgs(args)).status).toBe(0);
      // Without the fix the crash is a race that most, not all, runs lose.
      for (let run = 0; run < 5; run++) {
        const encode = ffmpeg(buildGifPaletteuseArgs(args));
        expect(encode.stderr.toString()).not.toContain("Reconfiguring filter graph");
        expect(encode.status).toBe(0);
      }
      const decoded = ffmpeg([
        "-i",
        args.outputPath,
        "-vf",
        "crop=1:1:0:0,format=rgba",
        "-f",
        "rawvideo",
        "-",
      ]);
      const alphas = [...decoded.stdout].filter((_, n) => n % 4 === 3);
      expect(alphas).toHaveLength(16);
      expect(alphas.slice(0, 2)).toEqual([0, 255]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
