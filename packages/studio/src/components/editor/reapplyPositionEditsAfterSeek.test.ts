// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { reapplyPositionEditsAfterSeek } from "./manualEditsSeekReapply";
import { STUDIO_PATH_OFFSET_ATTR } from "./manualEditsTypes";

describe("reapplyPositionEditsAfterSeek", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("does no per-edit work on a film Studio never edited", () => {
    document.body.innerHTML = '<div id="a"></div><div id="b"></div>';
    const queryAll = vi.spyOn(document, "querySelectorAll");

    reapplyPositionEditsAfterSeek(document);

    expect(queryAll).not.toHaveBeenCalled();
  });

  it("still migrates a legacy double-prefixed edit mark", () => {
    document.body.innerHTML = `<div id="a" data-${STUDIO_PATH_OFFSET_ATTR}="true"></div>`;

    reapplyPositionEditsAfterSeek(document);

    const el = document.getElementById("a");
    expect(el?.getAttribute(STUDIO_PATH_OFFSET_ATTR)).toBe("true");
    expect(el?.hasAttribute(`data-${STUDIO_PATH_OFFSET_ATTR}`)).toBe(false);
  });
});
