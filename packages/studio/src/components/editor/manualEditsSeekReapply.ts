// Puts Studio's committed edits back after a timeline seek has rendered over them.
import {
  STUDIO_BOX_SIZE_ATTR,
  STUDIO_HEIGHT_PROP,
  STUDIO_OFFSET_X_PROP,
  STUDIO_OFFSET_Y_PROP,
  STUDIO_PATH_OFFSET_ATTR,
  STUDIO_ROTATION_ATTR,
  STUDIO_ROTATION_PROP,
  STUDIO_WIDTH_PROP,
} from "./manualEditsTypes";
import { applyStudioBoxSize, applyStudioPathOffset, applyStudioRotation } from "./manualEditsDom";
import { applyStudioMotionFromDom } from "./studioMotion";
import { STUDIO_MOTION_ATTR, STUDIO_MOTION_TIMELINE_ID } from "./studioMotionTypes";
import { gsapAnimatesProperty } from "./gsapAnimatesProperty";

function queryStudioElements(doc: Document, attr: string): HTMLElement[] {
  const ctor = doc.defaultView?.HTMLElement;
  if (!ctor) return [];
  const elements = Array.from(doc.querySelectorAll(`[${attr}="true"]`)).filter(
    (el): el is HTMLElement => el instanceof ctor,
  );
  // Handle legacy HTML files where attributes were persisted with a double data- prefix
  const legacyAttr = `data-${attr}`;
  for (const el of doc.querySelectorAll(`[${legacyAttr}="true"]`)) {
    if (el instanceof ctor && !el.hasAttribute(attr)) {
      el.setAttribute(attr, "true");
      el.removeAttribute(legacyAttr);
      elements.push(el);
    }
  }
  return elements;
}

function reapplyPathOffsets(doc: Document): void {
  for (const el of queryStudioElements(doc, STUDIO_PATH_OFFSET_ATTR)) {
    // Unlike size below, the offset channels COMPOSE — applying both doubles the move.
    if (gsapAnimatesProperty(el, "x", "y")) continue;
    const x = el.style.getPropertyValue(STUDIO_OFFSET_X_PROP);
    const y = el.style.getPropertyValue(STUDIO_OFFSET_Y_PROP);
    if (!x && !y) continue;
    const offset = { x: Number.parseFloat(x) || 0, y: Number.parseFloat(y) || 0 };
    applyStudioPathOffset(el, offset, { updateBase: false });
  }
}

/**
 * Put the studio's committed size back after a seek, GSAP-sized elements included.
 * Size does not compose the way the offset above does: both channels write width
 * and height, so the later write wins on the same number. Standing aside meant
 * nothing held the size while a soft reload reverted the old timeline (GSAP hands
 * back each tween's recorded starting width), so the element sat at its stylesheet
 * size until the new one rendered — the jump after a resize.
 */
function reapplyBoxSizes(doc: Document): void {
  for (const el of queryStudioElements(doc, STUDIO_BOX_SIZE_ATTR)) {
    const w = Number.parseFloat(el.style.getPropertyValue(STUDIO_WIDTH_PROP));
    const h = Number.parseFloat(el.style.getPropertyValue(STUDIO_HEIGHT_PROP));
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      applyStudioBoxSize(el, { width: w, height: h });
    }
  }
}
function reapplyRotations(doc: Document): void {
  for (const el of queryStudioElements(doc, STUDIO_ROTATION_ATTR)) {
    const angle = Number.parseFloat(el.style.getPropertyValue(STUDIO_ROTATION_PROP));
    if (Number.isFinite(angle)) {
      applyStudioRotation(el, { angle });
    }
  }
}

// Every mark a reapply below acts on, the legacy double-prefixed ones included.
const STUDIO_EDIT_SELECTOR = [STUDIO_PATH_OFFSET_ATTR, STUDIO_BOX_SIZE_ATTR, STUDIO_ROTATION_ATTR]
  .flatMap((attr) => [`[${attr}="true"]`, `[data-${attr}="true"]`])
  .concat(`[${STUDIO_MOTION_ATTR}]`)
  .join(",");

function hasStudioEdits(doc: Document): boolean {
  const timelines = (doc.defaultView as { __timelines?: Record<string, unknown> } | null)
    ?.__timelines;
  // A motion timeline outlives its marks until the next reapply kills it.
  return (
    Boolean(timelines?.[STUDIO_MOTION_TIMELINE_ID]) ||
    doc.querySelector(STUDIO_EDIT_SELECTOR) !== null
  );
}

export function reapplyPositionEditsAfterSeek(doc: Document): void {
  // Runs after every seek, so on every playback frame: a film Studio never edited costs one query.
  if (!hasStudioEdits(doc)) return;
  reapplyPathOffsets(doc);
  reapplyBoxSizes(doc);
  reapplyRotations(doc);
  applyStudioMotionFromDom(doc);
}
