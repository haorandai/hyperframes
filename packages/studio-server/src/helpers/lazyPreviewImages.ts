import { findStartTags } from "@hyperframes/core/compiler/html-document";
import { parseHTML } from "linkedom";

// A start that is not a plain number (a reference) counts as unknown and keeps the image eager.
function startsAfterZero(el: Element): boolean {
  for (let node: Element | null = el; node; node = node.parentElement) {
    if (Number(node.getAttribute("data-start")) > 0) return true;
  }
  return false;
}

const hasLoading = (img: Element) =>
  Array.from(img.attributes).some((attr) => attr.name.toLowerCase() === "loading");

export function lazyPreviewImages(html: string): string {
  if (!/<!doctype|<html[\s>]/i.test(html)) return html;
  const images = [...parseHTML(html).document.querySelectorAll("img")];
  // The scanner skips comments and raw text, so its `<img` offsets line up with the DOM's images.
  const tags = findStartTags(html, "img");
  if (tags.length !== images.length) return html;
  let out = html;
  for (let i = images.length - 1; i >= 0; i--) {
    const img = images[i] as Element;
    if (hasLoading(img) || !startsAfterZero(img)) continue;
    const at = (tags[i] ?? 0) + 4;
    out = `${out.slice(0, at)} loading="lazy"${out.slice(at)}`;
  }
  return out;
}
