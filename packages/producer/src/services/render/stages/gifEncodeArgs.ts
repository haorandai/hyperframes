import { join } from "node:path";
import type { Fps } from "@hyperframes/core";

export interface GifEncodeArgsInput {
  framesDir: string;
  framePattern: string;
  palettePath: string;
  outputPath: string;
  fps: Fps;
  loop: number;
  preserveAlpha: boolean;
}

function fpsToFfmpegArg(fps: Fps): string {
  return fps.den === 1 ? String(fps.num) : `${fps.num}/${fps.den}`;
}

// Fully opaque frames can arrive as RGB PNGs among RGBA ones. The format change would
// rebuild the filter graph, which paletteuse cannot survive (ffmpeg fails the encode).
function framesInput(input: GifEncodeArgsInput, fpsArg: string): string[] {
  return [
    "-framerate",
    fpsArg,
    "-reinit_filter",
    "0",
    "-i",
    join(input.framesDir, input.framePattern),
  ];
}

export function buildGifPalettegenArgs(input: GifEncodeArgsInput): string[] {
  const fpsArg = fpsToFfmpegArg(input.fps);
  const transparency = input.preserveAlpha ? ":reserve_transparent=1" : "";
  return [
    "-y",
    ...framesInput(input, fpsArg),
    "-vf",
    `fps=${fpsArg},palettegen=stats_mode=diff${transparency}`,
    input.palettePath,
  ];
}

export function buildGifPaletteuseArgs(input: GifEncodeArgsInput): string[] {
  const fpsArg = fpsToFfmpegArg(input.fps);
  const transparency = input.preserveAlpha ? ":alpha_threshold=128" : "";
  return [
    "-y",
    ...framesInput(input, fpsArg),
    "-i",
    input.palettePath,
    "-lavfi",
    `fps=${fpsArg} [x]; [x][1:v] paletteuse=dither=sierra2_4a${transparency}`,
    "-loop",
    String(input.loop),
    input.outputPath,
  ];
}
