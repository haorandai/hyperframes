import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

// The binaries media-use spawns: HYPERFRAMES_FFMPEG_PATH / HYPERFRAMES_FFPROBE_PATH when set, else PATH.
// A set path that cannot run `-version` throws, so a broken override never reads as "no metadata".
const runsByPath = new Map();

export class FfBinarySettingError extends Error {}

function configuredOr(name, envVar) {
  const setting = process.env[envVar]?.trim();
  if (!setting) return name;
  const path = resolve(setting);
  if (!runsByPath.has(path)) runsByPath.set(path, runsVersion(path));
  if (!runsByPath.get(path)) {
    throw new FfBinarySettingError(`${envVar} names "${path}", which cannot run: fix it or unset it.`);
  }
  return path;
}

function runsVersion(path) {
  try {
    execFileSync(path, ["-version"], { stdio: "ignore", timeout: 15000, windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

export const ffmpegBinary = () => configuredOr("ffmpeg", "HYPERFRAMES_FFMPEG_PATH");
export const ffprobeBinary = () => configuredOr("ffprobe", "HYPERFRAMES_FFPROBE_PATH");
