import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clonePinStyleFor,
  installPageSideCompositor,
  isPageSideCompositingSupported,
  PAGE_COMPOSITOR_BUILD_CANARY,
  PAGE_COMPOSITOR_CANVAS_ID,
} from "./engineModePageComposite.js";

describe("isPageSideCompositingSupported", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false outside the browser (no window)", () => {
    vi.stubGlobal("window", undefined);
    expect(isPageSideCompositingSupported()).toBe(false);
  });

  it("returns false outside the browser (no document)", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", undefined);
    expect(isPageSideCompositingSupported()).toBe(false);
  });

  it("returns true when drawElementImage and WebGL are both available", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {
      createElement: (tag: string) => {
        if (tag === "canvas") {
          return {
            setAttribute: () => undefined,
            layoutSubtree: true,
            getContext: (type: string) => {
              if (type === "2d") return { drawElementImage: () => undefined };
              if (type === "webgl")
                return { getExtension: () => ({ loseContext: () => undefined }) };
              return null;
            },
          };
        }
        return {};
      },
    });
    expect(isPageSideCompositingSupported()).toBe(true);
  });

  it("returns false when drawElementImage is missing", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {
      createElement: () => ({
        setAttribute: () => undefined,
        getContext: (type: string) =>
          type === "webgl" ? { getExtension: () => ({ loseContext: () => undefined }) } : {},
      }),
    });
    expect(isPageSideCompositingSupported()).toBe(false);
  });

  it("returns false when WebGL is unavailable", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {
      createElement: () => ({
        setAttribute: () => undefined,
        layoutSubtree: true,
        getContext: (type: string) =>
          type === "2d" ? { drawElementImage: () => undefined } : null,
      }),
    });
    expect(isPageSideCompositingSupported()).toBe(false);
  });
});

describe("clonePinStyleFor", () => {
  it("fixes a 0x0 inset:0 scene root to its live-measured box (the collapse this exists to prevent)", () => {
    // A scene root sized only by `position:absolute; inset:0` measures as
    // the full composition frame in the live document (its containing block
    // there is the real ancestor chain) — collapses to 0x0 only once cloned
    // into the staging canvas's own layout subtree.
    const pin = clonePinStyleFor({ left: 0, top: 0, width: 1080, height: 1920 });
    expect(pin).toEqual({ left: "0px", top: "0px", width: "1080px", height: "1920px" });
  });

  it("preserves an authored explicit width/height and offset instead of overriding it", () => {
    // A scene root with its own explicit size/position (e.g. a picture-in-
    // picture panel) measures as that exact box in the live document —
    // clonePinStyleFor must reproduce it verbatim, not the full composition
    // frame, or the clone would silently grow to fill the canvas.
    const pin = clonePinStyleFor({ left: 120, top: 240, width: 400, height: 300 });
    expect(pin).toEqual({ left: "120px", top: "240px", width: "400px", height: "300px" });
  });
});

// A WebGL context whose every call succeeds.
function fakeWebGl(): object {
  return new Proxy(
    {},
    {
      get: (_target, key) => {
        if (key === "getShaderParameter" || key === "getProgramParameter") return () => true;
        if (key === "getExtension") return () => ({ loseContext: () => undefined });
        return () => ({});
      },
    },
  );
}

describe("page-side compositor seek", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  class FakeScene {
    style = { visibility: "hidden" };
    constructor(private readonly attrs: Record<string, string>) {}
    getAttribute(name: string) {
      return this.attrs[name] ?? null;
    }
  }

  // A browser with drawElementImage and a WebGL context whose every call succeeds.
  function installWithHiddenScenes(
    timing: Record<string, readonly [start: string, duration: string]>,
  ) {
    const gl = fakeWebGl();
    const canvas = () => ({
      style: {},
      width: 0,
      height: 0,
      layoutSubtree: true,
      firstChild: null,
      setAttribute: () => undefined,
      remove: () => undefined,
      getContext: (type: string) => (type === "2d" ? { drawElementImage: () => undefined } : gl),
    });
    const scenes = new Map(
      Object.entries(timing).map(([id, [start, duration]]) => [
        id,
        new FakeScene({ "data-start": start, "data-duration": duration }),
      ]),
    );
    let startPolling: (() => void) | undefined;
    const hf = { seek: vi.fn() };
    vi.stubGlobal("window", {
      __hf: hf,
      setInterval: (poll: () => void) => {
        startPolling = poll;
        return 1;
      },
      clearInterval: () => undefined,
    });
    vi.stubGlobal("HTMLElement", FakeScene);
    vi.stubGlobal("document", {
      createElement: canvas,
      getElementById: (id: string) => scenes.get(id) ?? null,
      body: { appendChild: () => undefined },
    });
    const installed = installPageSideCompositor({
      scenes: ["s4", "s5"],
      transitions: [{ time: 4.4, duration: 0.8, shader: "domain-warp" }],
      bgColor: "#000",
      accentColors: { accent: [1, 1, 1], dark: [0, 0, 0], bright: [1, 1, 1] },
      width: 1920,
      height: 1080,
      defaultDuration: 0.8,
    });
    startPolling?.();
    return { installed, hf, scenes };
  }

  // s4 runs 2.8 to 4.8 s, s5 4.4 to 8.0 s; a plain scene plays before and after them.
  const film = { s4: ["2.8", "2"], s5: ["4.4", "3.6"] } as const;

  it("leaves the runtime's hide on a shader scene before its window", () => {
    const { installed, hf, scenes } = installWithHiddenScenes(film);
    expect(installed).toBe(true);
    hf.seek(2.4);
    expect(scenes.get("s4")?.style.visibility).toBe("hidden");
  });

  it("leaves the runtime's hide on the last shader scene after its window", () => {
    const { hf, scenes } = installWithHiddenScenes(film);
    hf.seek(8.8);
    expect(scenes.get("s5")?.style.visibility).toBe("hidden");
  });
});

// The transparent inset case: 640x360 #main holding scenes inset 90px 160px, as in the
// page-side-shader-compositor-render-compat fixture with a transparent page.
describe("page-side compositor scene copies", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const BOX = {
    main: { left: 0, top: 0, width: 640, height: 360 },
    scene: { left: 160, top: 90, width: 320, height: 180 },
  };

  class FakeEl {
    style: Record<string, string> = {};
    children: FakeEl[] = [];
    parentElement: FakeEl | null = null;
    constructor(
      readonly id: string,
      readonly copyOf: FakeEl | null = null,
    ) {}
    getAttribute() {
      return null;
    }
    getBoundingClientRect() {
      return this.id === "main" ? BOX.main : BOX.scene;
    }
    cloneNode(deep: boolean) {
      const copy = new FakeEl(`${this.id}-copy`, this);
      if (deep) copy.children = this.children.map((c) => c.cloneNode(true));
      return copy;
    }
    appendChild(child: FakeEl) {
      this.children.push(child);
      child.parentElement = this;
      return child;
    }
    querySelectorAll() {
      return [];
    }
  }

  function installTransparentInsetFilm(opts: { failDraw?: boolean } = {}) {
    const calls: Array<{ canvas: number; op: string; args: unknown[] }> = [];
    const gl = new Proxy(fakeWebGl(), {
      get: (target, key) => {
        if (key === "texImage2D") {
          return (...args: unknown[]) => calls.push({ canvas: -1, op: "texImage2D", args });
        }
        return Reflect.get(target, key);
      },
    });
    const canvases: Array<{ style: Record<string, string> }> = [];
    const createCanvas = () => {
      const index = canvases.length;
      const children: FakeEl[] = [];
      const record =
        (op: string) =>
        (...args: unknown[]) => {
          calls.push({ canvas: index, op, args });
          if (op === "drawElementImage" && opts.failDraw) throw new Error("No cached paint record");
        };
      const ctx = {
        fillStyle: "",
        fillRect: record("fillRect"),
        clearRect: record("clearRect"),
        drawElementImage: record("drawElementImage"),
      };
      const canvas = {
        style: {} as Record<string, string>,
        width: 0,
        height: 0,
        layoutSubtree: true,
        setAttribute: () => undefined,
        remove: () => undefined,
        get firstChild() {
          return children[0] ?? null;
        },
        get firstElementChild() {
          return children[0] ?? null;
        },
        appendChild: (child: FakeEl) => children.push(child),
        removeChild: () => children.shift(),
        querySelectorAll: () => [],
        getContext: (type: string) => (type === "2d" ? ctx : gl),
      };
      canvases.push(canvas);
      return canvas;
    };
    const body = new FakeEl("body");
    const main = body.appendChild(new FakeEl("main"));
    const scenes = new Map([
      ["scene-a", main.appendChild(new FakeEl("scene-a"))],
      ["scene-b", main.appendChild(new FakeEl("scene-b"))],
    ]);
    let startPolling: (() => void) | undefined;
    const hf = { seek: vi.fn() };
    const win: Record<string, unknown> = {
      __hf: hf,
      setInterval: (poll: () => void) => {
        startPolling = poll;
        return 1;
      },
      clearInterval: () => undefined,
    };
    vi.stubGlobal("window", win);
    vi.stubGlobal("HTMLElement", FakeEl);
    vi.stubGlobal("document", {
      createElement: createCanvas,
      getElementById: (id: string) => scenes.get(id) ?? null,
      body,
      documentElement: null,
    });
    installPageSideCompositor({
      scenes: ["scene-a", "scene-b"],
      transitions: [{ time: 0.75, duration: 0.85, shader: "glitch" }],
      bgColor: "transparent",
      accentColors: { accent: [1, 1, 1], dark: [0, 0, 0], bright: [1, 1, 1] },
      width: 640,
      height: 360,
      defaultDuration: 0.85,
    });
    startPolling?.();
    const composite = async (time: number) => {
      hf.seek(time);
      await (win.__hf_page_composite_prepare as () => Promise<boolean>)();
      return (win.__hf_page_composite_resolve as () => boolean)();
    };
    const overlay = () =>
      canvases.find((c) => c.style.cssText?.includes("2147483646")) as {
        style: Record<string, string>;
      };
    return { calls, composite, overlay };
  }

  it("stages each scene copy inside a copy of its composition root, drawn at the root's box", async () => {
    const { calls, composite } = installTransparentInsetFilm();
    expect(await composite(1.2)).toBe(true);
    const draws = calls.filter((c) => c.op === "drawElementImage");
    expect(draws).toHaveLength(2);
    for (const [index, sceneId] of [
      [0, "scene-a"],
      [1, "scene-b"],
    ] as const) {
      const root = draws[index]?.args[0] as FakeEl;
      expect(root.copyOf?.id).toBe("main");
      expect(root.children.map((c) => c.copyOf?.id)).toEqual([sceneId]);
      // The scene copy keeps its own authored box; only the root copy is pinned.
      expect(root.children[0]?.style.left).toBeUndefined();
      expect(draws[index]?.args.slice(1)).toEqual([0, 0, 640, 360]);
    }
  });

  it("clears both staging bitmaps after the textures are uploaded", async () => {
    const { calls, composite } = installTransparentInsetFilm();
    await composite(1.2);
    const lastUpload = calls.map((c) => c.op).lastIndexOf("texImage2D");
    const staging = new Set(calls.filter((c) => c.op === "drawElementImage").map((c) => c.canvas));
    expect(staging.size).toBe(2);
    for (const canvas of staging) {
      const lastClear = Math.max(
        ...calls.flatMap((c, n) => (c.canvas === canvas && c.op === "clearRect" ? [n] : [])),
      );
      expect(lastClear).toBeGreaterThan(lastUpload);
      const drawn = calls.findIndex((c) => c.canvas === canvas && c.op === "drawElementImage");
      const clearedBeforeUpload = calls.some(
        (c, n) => c.canvas === canvas && c.op === "clearRect" && n > drawn && n < lastUpload,
      );
      expect(clearedBeforeUpload).toBe(false);
    }
  });

  it("clears the staging bitmaps and hides the overlay when a scene capture fails", async () => {
    const { calls, composite, overlay } = installTransparentInsetFilm({ failDraw: true });
    expect(await composite(1.2)).toBe(false);
    const drawn = calls.find((c) => c.op === "drawElementImage")?.canvas;
    expect(calls.some((c) => c.canvas === drawn && c.op === "clearRect")).toBe(true);
    expect(overlay().style.display).toBe("none");
  });
});

describe("page-side compositor exported constants", () => {
  it("exports a stable canary string used by the bundled-CLI smoke", () => {
    expect(PAGE_COMPOSITOR_BUILD_CANARY).toBe("__hf_page_compositor_v1__");
  });

  it("exports a stable canvas id", () => {
    expect(PAGE_COMPOSITOR_CANVAS_ID).toBe("__hf-page-side-compositor");
  });
});
