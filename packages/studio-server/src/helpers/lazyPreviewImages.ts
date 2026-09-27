import { parseHTML } from "linkedom";

// Comments and raw-text elements hold no tags, so the `<img` left in source order match the DOM's.
const IMG_OR_RAW_TEXT =
  /<!--[\s\S]*?-->|<(script|style|textarea|title)\b[\s\S]*?<\/\1\s*>|<img\b/gi;

// A start that is not a plain number (a reference) counts as unknown and keeps the image eager.
function startsAfterZero(el: Element): boolean {
  for (let node: Element | null = el; node; node = node.parentElement) {
    if (Number(node.getAttribute("data-start")) > 0) return true;
  }
  return false;
}

export function lazyPreviewImages(html: string): string {
  if (!/<!doctype|<html[\s>]/i.test(html)) return html;
  const images = [...parseHTML(html).document.querySelectorAll("img")];
  const tags = [...html.matchAll(IMG_OR_RAW_TEXT)].filter((m) => m[0].length === 4);
  if (tags.length !== images.length) return html;
  let out = html;
  for (let i = images.length - 1; i >= 0; i--) {
    const img = images[i] as Element;
    if (img.hasAttribute("loading") || !startsAfterZero(img)) continue;
    const at = (tags[i]?.index ?? 0) + 4;
    out = `${out.slice(0, at)} loading="lazy"${out.slice(at)}`;
  }
  return out;
}
