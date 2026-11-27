import { STUDIO_PALETTE_IDS } from "@manent/settings";
import { describe, expect, test } from "bun:test";
import { playGemFoley } from "../src/components/brand/gem-audio.ts";
import { GEM_SCENES } from "../src/components/brand/gem-scene-registry.ts";
import { drawStageBurst } from "../src/components/brand/gem-stage-bursts.ts";
import {
  drawBackAtmosphere,
  drawFrontVignette,
  drawRegistrationFrame,
  withAlpha,
} from "../src/components/brand/gem-stage-primitives.ts";
import type { StageTokens } from "../src/components/brand/gem-stage-types.ts";

interface MockCanvasLog {
  saves: number;
  restores: number;
  draws: number;
  badNumbers: number;
}

function createMockCtx(): {
  ctx: CanvasRenderingContext2D;
  log: MockCanvasLog;
} {
  const log: MockCanvasLog = { saves: 0, restores: 0, draws: 0, badNumbers: 0 };
  const checkArgs = (args: unknown[]): void => {
    for (const arg of args) {
      if (typeof arg === "number" && !Number.isFinite(arg)) {
        log.badNumbers += 1;
      }
    }
  };
  const fakeGradient = {
    addColorStop: (...args: unknown[]) => checkArgs(args),
  };
  const drawMethods = new Set([
    "stroke",
    "fill",
    "fillRect",
    "strokeRect",
    "arc",
    "ellipse",
    "moveTo",
    "lineTo",
    "bezierCurveTo",
    "quadraticCurveTo",
    "roundRect",
  ]);
  const proxy = new Proxy(
    {
      globalAlpha: 1,
      lineWidth: 1,
      lineCap: "butt",
      lineJoin: "miter",
      strokeStyle: "",
      fillStyle: "",
      globalCompositeOperation: "source-over",
      save() {
        log.saves += 1;
      },
      restore() {
        log.restores += 1;
      },
      createRadialGradient(...args: unknown[]) {
        checkArgs(args);
        return fakeGradient;
      },
      createLinearGradient(...args: unknown[]) {
        checkArgs(args);
        return fakeGradient;
      },
      setLineDash(segments: number[]) {
        checkArgs(segments);
      },
    } as Record<string, unknown>,
    {
      get(target, prop) {
        if (prop in target) return target[prop as string];
        return (...args: unknown[]) => {
          checkArgs(args);
          if (drawMethods.has(String(prop))) log.draws += 1;
        };
      },
    },
  );
  return { ctx: proxy as unknown as CanvasRenderingContext2D, log };
}

const SAMPLE_TOKENS: StageTokens = Object.freeze({
  ink: "rgb(28, 25, 21)",
  surface: "rgb(252, 250, 245)",
  accent: "rgb(30, 74, 150)",
  accent2: "rgb(142, 92, 24)",
  muted: "rgb(90, 82, 68)",
  line: "rgb(213, 204, 186)",
  desk: "rgb(231, 225, 214)",
  tint: "rgb(30, 74, 150)",
  subtle: "rgba(0, 0, 0, 0.06)",
});

const ALLOWED_KEYFRAME_KEYS = new Set([
  "transform",
  "opacity",
  "offset",
  "easing",
  "composite",
]);

describe("Hidden Gem 24 bespoke collector scenes", () => {
  test("covers every StudioPaletteId with valid stillT and compositor-only WAAPI hero keyframes", () => {
    expect(Object.keys(GEM_SCENES).toSorted()).toEqual(
      [...STUDIO_PALETTE_IDS].toSorted(),
    );
    for (const id of STUDIO_PALETTE_IDS) {
      const scene = GEM_SCENES[id];
      expect(scene.stillT).toBeGreaterThanOrEqual(0.2);
      expect(scene.stillT).toBeLessThanOrEqual(1);
      expect(scene.hero.keyframes.length).toBeGreaterThanOrEqual(2);
      expect(Number(scene.hero.options.duration)).toBeGreaterThanOrEqual(400);
      expect(Number(scene.hero.options.duration)).toBeLessThanOrEqual(2400);
      for (const frame of scene.hero.keyframes) {
        for (const key of Object.keys(frame)) {
          expect(ALLOWED_KEYFRAME_KEYS.has(key)).toBe(true);
        }
      }
    }
  });

  test("every one of the 24 scenes draws cleanly across launch, mid, stillT, end and ambient settle with balanced canvas state", () => {
    const samples = [
      { t: 0, idle: 0, reduced: false },
      { t: 0.45, idle: 0, reduced: false },
      { t: 1, idle: 0, reduced: false },
      { t: 1, idle: 1.5, reduced: false },
    ];
    for (const id of STUDIO_PALETTE_IDS) {
      const scene = GEM_SCENES[id];
      const timeline = [
        ...samples,
        { t: scene.stillT, idle: 0, reduced: true },
      ];
      for (const point of timeline) {
        const { ctx, log } = createMockCtx();
        drawRegistrationFrame(ctx, 288, 152, SAMPLE_TOKENS.line, 0.55);
        scene.draw(ctx, {
          w: 288,
          h: 152,
          cx: 144,
          cy: 76,
          t: point.t,
          idle: point.idle,
          reduced: point.reduced,
          tokens: SAMPLE_TOKENS,
        });
        expect(log.saves).toBe(log.restores);
        expect(log.badNumbers).toBe(0);
        if (point.t > 0) {
          expect(log.draws).toBeGreaterThan(8);
        }
      }
    }
  });

  test("withAlpha scales globalAlpha inside save/restore and skips near-zero draws", () => {
    const { ctx, log } = createMockCtx();
    let observed = -1;
    withAlpha(ctx, 0.4, () => {
      observed = ctx.globalAlpha;
    });
    expect(observed).toBeCloseTo(0.4, 5);
    expect(log.saves).toBe(1);
    expect(log.restores).toBe(1);

    let called = false;
    withAlpha(ctx, 0, () => {
      called = true;
    });
    expect(called).toBe(false);
    expect(log.saves).toBe(1);
  });

  test("all 24 bespoke interactive click bursts and 3-plane atmospheric layers draw with balanced canvas state", () => {
    for (const id of STUDIO_PALETTE_IDS) {
      const rolls = id === "chiaroscuro" ? [7, 20] : [undefined];
      for (const roll of rolls) {
        for (const p of [0.1, 0.5, 0.9]) {
          const { ctx, log } = createMockCtx();
          drawBackAtmosphere(ctx, 288, 152, 0.4, -0.3, 0.5, SAMPLE_TOKENS);
          drawStageBurst(
            ctx,
            id,
            { x: 144, y: 76, startMs: 0, seed: 13, roll },
            p,
            SAMPLE_TOKENS,
          );
          drawFrontVignette(
            ctx,
            288,
            152,
            144,
            76,
            0.8,
            0.2,
            0.4,
            -0.3,
            0.5,
            SAMPLE_TOKENS,
          );
          expect(log.saves).toBe(log.restores);
          expect(log.badNumbers).toBe(0);
          expect(log.draws).toBeGreaterThan(5);
        }
      }
      // Foley degrades cleanly when muted or outside a browser AudioContext.
      expect(() =>
        playGemFoley(id, { enabled: false, kind: "open" }),
      ).not.toThrow();
      expect(() =>
        playGemFoley(id, { enabled: true, kind: "burst" }),
      ).not.toThrow();
    }
    expect(() =>
      playGemFoley("chiaroscuro", { enabled: true, kind: "crit" }),
    ).not.toThrow();
  });
});
