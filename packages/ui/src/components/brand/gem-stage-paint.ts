// Shared Canvas 2D compositor and probe token reader for GemStage's 3-plane collector rendering.
import type { StudioPaletteId } from "@manent/settings";
import { BURST_DURATION_MS, drawStageBurst } from "./gem-stage-bursts.ts";
import {
  clamp01,
  drawBackAtmosphere,
  drawFrontVignette,
  drawRegistrationFrame,
} from "./gem-stage-primitives.ts";
import type {
  GemSceneSpec,
  StageBurst,
  StageTokens,
} from "./gem-stage-types.ts";

export const STAGE_W = 288;
export const STAGE_H = 152;
export const FLOURISH_MS = 2100;
export const SETTLE_TOTAL_MS = 6000;
export const CHARGE_HOLD_MS = 450;

export function prefersReducedMotion(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Reads browser-resolved colours from `.mn-gem-stage-probe` so Canvas 2D inherits light-dark tokens. */
export function readStageTokens(probe: HTMLElement | null): StageTokens {
  if (
    probe === null ||
    typeof window === "undefined" ||
    typeof window.getComputedStyle !== "function"
  ) {
    return {
      ink: "",
      surface: "",
      accent: "",
      accent2: "",
      muted: "",
      line: "",
      desk: "",
      tint: "",
      subtle: "",
    };
  }
  const style = window.getComputedStyle(probe);
  return {
    ink: style.color,
    surface: style.backgroundColor,
    accent: style.borderTopColor,
    accent2: style.borderRightColor,
    muted: style.borderBottomColor,
    line: style.borderLeftColor,
    desk: style.outlineColor,
    tint: style.textDecorationColor,
    subtle: style.columnRuleColor,
  };
}

/** Paints all 3 depth planes (atmosphere, parallax scene, foreground bokeh/foil/charge/bursts). */
export function paintStageCanvas(
  canvas: HTMLCanvasElement,
  palette: StudioPaletteId,
  scene: GemSceneSpec,
  tokens: StageTokens,
  t: number,
  idle: number,
  reduced: boolean,
  px: number,
  py: number,
  charge: number,
  bursts: readonly StageBurst[],
  nowMs: number,
): void {
  const ctx =
    typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
  if (ctx === null) return;
  const dpr = Math.min(
    typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
    2,
  );
  const pixelW = Math.round(STAGE_W * dpr);
  const pixelH = Math.round(STAGE_H * dpr);
  if (canvas.width !== pixelW || canvas.height !== pixelH) {
    canvas.width = pixelW;
    canvas.height = pixelH;
  }
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, STAGE_W, STAGE_H);

  drawBackAtmosphere(ctx, STAGE_W, STAGE_H, px, py, charge, tokens);

  ctx.save();
  if (!reduced && (px !== 0 || py !== 0)) {
    ctx.translate(px * 4.5, py * 3.5);
  }
  scene.draw(ctx, {
    w: STAGE_W,
    h: STAGE_H,
    cx: STAGE_W / 2,
    cy: STAGE_H / 2,
    t,
    idle,
    reduced,
    px,
    py,
    charge,
    tokens,
  });
  ctx.restore();

  drawRegistrationFrame(ctx, STAGE_W, STAGE_H, tokens.line, 0.55);
  drawFrontVignette(
    ctx,
    STAGE_W,
    STAGE_H,
    STAGE_W / 2,
    STAGE_H / 2,
    t,
    idle,
    px,
    py,
    charge,
    tokens,
  );
  for (const burst of bursts) {
    const progress = clamp01((nowMs - burst.startMs) / BURST_DURATION_MS);
    if (progress < 1) {
      drawStageBurst(ctx, palette, burst, progress, tokens);
    }
  }
  ctx.restore();
}
