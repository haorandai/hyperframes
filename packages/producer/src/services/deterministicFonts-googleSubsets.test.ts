/**
 * Regression test for the Google Fonts multi-subset cache collision.
 *
 * Google Fonts' css2 API returns ONE @font-face per (weight × unicode-range
 * subset) — e.g. for a single weight you get separate `vietnamese`,
 * `latin-ext`, and `latin` faces, each pointing at a DISTINCT woff2 whose
 * glyph coverage matches its `unicode-range`.
 *
 * The bug: the on-disk cache keyed woff2 files by `${weight}-${style}` only,
 * ignoring the subset. So all subsets of a weight collided on one filename —
 * only the FIRST subset in the CSS (vietnamese, for many display families)
 * was ever downloaded, and every later subset read that same file back.
 * Compounding it, the injected @font-face dropped `unicode-range`, so the face
 * claimed to cover every codepoint while only containing the first subset's
 * glyphs. Result: Latin letters absent from the embedded font fell back to a
 * different font (the visible "wrong A" glitch).
 *
 * These tests inject `fetchImpl` (no network) and a temp `HYPERFRAMES_FONT_CACHE_DIR`
 * so they are hermetic.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _clearGoogleFontCssCacheForTests } from "./deterministicFonts.js";

beforeEach(() => _clearGoogleFontCssCacheForTests());

let cacheDir: string;
let prevCacheEnv: string | undefined;

beforeAll(() => {
  prevCacheEnv = process.env.HYPERFRAMES_FONT_CACHE_DIR;
  cacheDir = mkdtempSync(join(tmpdir(), "hf-font-cache-"));
  process.env.HYPERFRAMES_FONT_CACHE_DIR = cacheDir;
});

afterAll(() => {
  if (prevCacheEnv === undefined) delete process.env.HYPERFRAMES_FONT_CACHE_DIR;
  else process.env.HYPERFRAMES_FONT_CACHE_DIR = prevCacheEnv;
  rmSync(cacheDir, { recursive: true, force: true });
});

const VIET_RANGE = "U+0102-0103, U+1EA0-1EF9, U+20AB";
const LATIN_RANGE = "U+0000-00FF, U+0131, U+2000-206F";
const VIET_URL = "https://fonts.gstatic.com/s/testfam/v1/VIET-subset.woff2";
const LATIN_URL = "https://fonts.gstatic.com/s/testfam/v1/LATIN-subset.woff2";
// distinct, identifiable "woff2" bodies (content need not be a real font here)
const VIET_BYTES = "VIET_SUBSET_BYTES";
const LATIN_BYTES = "LATIN_SUBSET_BYTES";
const b64 = (s: string) => Buffer.from(s).toString("base64");

// Two subsets for the SAME weight, vietnamese FIRST (as Google orders it for
// display families) then latin — exactly the shape that triggered the bug.
const CSS = `/* vietnamese */
@font-face {
  font-family: 'TestFam';
  font-style: normal;
  font-weight: 900;
  font-display: swap;
  src: url(${VIET_URL}) format('woff2');
  unicode-range: ${VIET_RANGE};
}
/* latin */
@font-face {
  font-family: 'TestFam';
  font-style: normal;
  font-weight: 900;
  font-display: swap;
  src: url(${LATIN_URL}) format('woff2');
  unicode-range: ${LATIN_RANGE};
}`;

function makeGoogleFetch(): typeof fetch {
  return (async (input: unknown) => {
    const url = String(input);
    if (url.includes("css2")) return new Response(CSS, { status: 200 });
    if (url === VIET_URL) return new Response(VIET_BYTES, { status: 200 });
    if (url === LATIN_URL) return new Response(LATIN_BYTES, { status: 200 });
    return new Response("", { status: 404 });
  }) as unknown as typeof fetch;
}

const HTML = `<!doctype html><html><head><style>
  h1 { font-family: "TestFam", sans-serif; }
</style></head><body><h1>CATALOG</h1></body></html>`;

describe("Google Fonts multi-subset embedding", () => {
  it("downloads and embeds EACH subset distinctly (no cache collision)", async () => {
    const { injectDeterministicFontFaces } = await import("./deterministicFonts.js");
    const result = await injectDeterministicFontFaces(HTML, { fetchImpl: makeGoogleFetch() });

    // Both subsets' distinct bytes must be present — the latin subset must NOT
    // be clobbered by the vietnamese one. (Before the fix, the latin face
    // carried the vietnamese bytes because both shared one cache filename.)
    expect(result).toContain(b64(VIET_BYTES));
    expect(result).toContain(b64(LATIN_BYTES));
  });

  it("preserves each face's unicode-range so the browser picks the right subset per codepoint", async () => {
    const { injectDeterministicFontFaces } = await import("./deterministicFonts.js");
    const result = await injectDeterministicFontFaces(HTML, { fetchImpl: makeGoogleFetch() });

    expect(result).toContain(VIET_RANGE);
    expect(result).toContain(LATIN_RANGE);
    // the latin bytes and the latin range belong to the same @font-face block
    const faces = result.split("@font-face").filter((b) => b.includes("TestFam"));
    const latinFace = faces.find((f) => f.includes(b64(LATIN_BYTES)));
    expect(latinFace).toBeDefined();
    expect(latinFace).toContain(LATIN_RANGE);
  });
});

const AUTHORED_HREF =
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Nunito+Sans:wght@400;600;700&display=swap";
const FRAUNCES_FILE = "https://fonts.gstatic.com/s/fraunces/authored.woff2";
const NUNITO_FILE = "https://fonts.gstatic.com/s/nunitosans/authored.woff2";
const WIDE_FILE = "https://fonts.gstatic.com/s/fraunces/wide.woff2";
const INTER_FILE = "https://fonts.gstatic.com/s/inter/v1/inter-supplement.woff2";

const AUTHORED_CSS = `@font-face {
  font-family: 'Fraunces';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url(${FRAUNCES_FILE}) format('woff2');
  unicode-range: U+0000-00FF;
}
@font-face {
  font-family: 'Nunito Sans';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(${NUNITO_FILE}) format('woff2');
  unicode-range: U+0000-00FF;
}`;

function authoredPage(head: string): string {
  return `<!doctype html><html><head>${head}</head><body><h1>Seconds</h1></body></html>`;
}

function authoredFetch(cssStatus: number): { fetchImpl: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  const fetchImpl = (async (input: unknown) => {
    const url = String(input);
    urls.push(url);
    if (url === AUTHORED_HREF)
      return new Response(cssStatus === 200 ? AUTHORED_CSS : "", { status: cssStatus });
    if (url.includes("family=Fraunces:ital,wght@")) {
      return new Response(
        `@font-face { font-family: 'Fraunces'; font-style: normal; font-weight: 500; src: url(${WIDE_FILE}) format('woff2'); unicode-range: U+0000-00FF; }`,
        { status: 200 },
      );
    }
    if (url.includes("family=Inter:")) {
      return new Response(
        `@font-face { font-family: 'Inter'; font-style: normal; font-weight: 300; src: url(${INTER_FILE}) format('woff2'); }`,
        { status: 200 },
      );
    }
    if (url === FRAUNCES_FILE) return new Response("FRAUNCES_LINKED", { status: 200 });
    if (url === NUNITO_FILE) return new Response("NUNITO_LINKED", { status: 200 });
    if (url === WIDE_FILE) return new Response("FRAUNCES_WIDE", { status: 200 });
    if (url === INTER_FILE) return new Response("INTER_BYTES", { status: 200 });
    return new Response("", { status: 404 });
  }) as unknown as typeof fetch;
  return { fetchImpl, urls };
}

describe("authored Google font stylesheet", () => {
  it("embeds the linked file and leaves it after the link", async () => {
    const { injectDeterministicFontFaces } = await import("./deterministicFonts.js");
    const { fetchImpl, urls } = authoredFetch(200);
    const result = await injectDeterministicFontFaces(
      authoredPage(
        `<link rel="stylesheet" href="${AUTHORED_HREF}">` +
          `<style>h1 { font-family: "Fraunces", serif; } p { font-family: "Nunito Sans", sans-serif; }</style>`,
      ),
      { fetchImpl, allowSystemFontCapture: false },
    );

    expect(urls.filter((url) => url.startsWith("https://fonts.googleapis.com/"))).toEqual([
      AUTHORED_HREF,
    ]);
    expect(result).toContain(b64("FRAUNCES_LINKED"));
    expect(result).toContain(b64("NUNITO_LINKED"));
    expect(result).not.toContain(b64("FRAUNCES_WIDE"));
    const frauncesFace = result
      .split("@font-face")
      .find((block) => block.includes('font-family: "Fraunces"'));
    expect(frauncesFace).toBeDefined();
    expect(frauncesFace).not.toContain(b64("NUNITO_LINKED"));
    expect(result.indexOf("data-hyperframes-deterministic-fonts")).toBeGreaterThan(
      result.indexOf(AUTHORED_HREF),
    );
  });

  it("does not replace a failed link with the weight-only file", async () => {
    const { injectDeterministicFontFaces } = await import("./deterministicFonts.js");
    const { fetchImpl, urls } = authoredFetch(400);
    const result = await injectDeterministicFontFaces(
      authoredPage(
        `<link rel="stylesheet" href="${AUTHORED_HREF}"><style>h1 { font-family: "Fraunces", serif; }</style>`,
      ),
      { fetchImpl, allowSystemFontCapture: false },
    );

    expect(urls.some((url) => url.includes("ital,wght@"))).toBe(false);
    expect(result).not.toContain(b64("FRAUNCES_WIDE"));
    expect(result).not.toContain("data-hyperframes-deterministic-fonts");
  });

  it("still requests by family name when the page has no Google link", async () => {
    const { injectDeterministicFontFaces } = await import("./deterministicFonts.js");
    const { fetchImpl, urls } = authoredFetch(200);
    const result = await injectDeterministicFontFaces(
      authoredPage(`<style>h1 { font-family: "Fraunces", serif; }</style>`),
      { fetchImpl, allowSystemFontCapture: false },
    );

    expect(urls.some((url) => url.includes("family=Fraunces:ital,wght@"))).toBe(true);
    expect(result).toContain(b64("FRAUNCES_WIDE"));
  });

  it("still embeds Inter for Arial when the page links Arial", async () => {
    const { injectDeterministicFontFaces } = await import("./deterministicFonts.js");
    const { fetchImpl, urls } = authoredFetch(200);
    await injectDeterministicFontFaces(
      authoredPage(
        `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Arial">` +
          `<style>h1 { font-family: Arial, sans-serif; }</style>`,
      ),
      { fetchImpl, allowSystemFontCapture: false },
    );

    expect(urls.some((url) => url.includes("family=Arial"))).toBe(false);
    expect(urls.some((url) => url.includes("family=Inter:"))).toBe(true);
  });
});
