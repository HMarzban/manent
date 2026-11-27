// Pure Canvas 2D geometry, easing, 3-plane atmosphere, and token-safe drawing helpers for the 24 Hidden Gem scenes.
// Zero raw colour literals: all fills and strokes use resolved `StageTokens` or `"transparent"`.
import type { StageTokens } from "./gem-stage-types.ts";

export const TAU = Math.PI * 2;

export function clamp01(v: number): number {
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function seg(t: number, start: number, end: number): number {
  return clamp01((t - start) / Math.max(0.0001, end - start));
}

export function easeOutCubic(t: number): number {
  const u = 1 - clamp01(t);
  return 1 - u * u * u;
}

export function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * clamp01(t)) - 1) / 2;
}

export function easeOutBack(t: number): number {
  const u = clamp01(t) - 1;
  const c1 = 1.70158;
  return 1 + (c1 + 1) * u * u * u + c1 * u * u;
}

/** Deterministic pseudo-random number in [0, 1) for repeatable stars, motes, and dust. */
export function seeded(index: number, salt = 1): number {
  const x = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Runs `draw` with multiplied canvas alpha and restores state cleanly. */
export function withAlpha(
  ctx: CanvasRenderingContext2D,
  alpha: number,
  draw: () => void,
): void {
  if (alpha <= 0.002) return;
  ctx.save();
  ctx.globalAlpha *= clamp01(alpha);
  draw();
  ctx.restore();
}

/** Draws a soft hue-pure radial glow fading cleanly to `"transparent"`. */
export function radialGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  token: string,
  alpha: number,
): void {
  if (radius <= 0 || alpha <= 0.002) return;
  withAlpha(ctx, alpha, () => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, token);
    g.addColorStop(0.55, token);
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.fill();
  });
}

/** Draws a hairline or bold rule segment between two points. */
export function drawRule(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  token: string,
  alpha: number,
  width = 1,
): void {
  withAlpha(ctx, alpha, () => {
    ctx.strokeStyle = token;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  });
}

/** Draws a circular arc or full ring. */
export function drawRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  token: string,
  alpha: number,
  width = 1,
  start = 0,
  end = TAU,
): void {
  if (radius <= 0) return;
  withAlpha(ctx, alpha, () => {
    ctx.strokeStyle = token;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(x, y, radius, start, end);
    ctx.stroke();
  });
}

/** Draws a crisp filled circle dot. */
export function drawDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  token: string,
  alpha: number,
): void {
  if (radius <= 0) return;
  withAlpha(ctx, alpha, () => {
    ctx.fillStyle = token;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.fill();
  });
}

/** Draws a 4-point calligraphic diamond spark. */
export function drawSpark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  token: string,
  alpha: number,
): void {
  if (size <= 0.3) return;
  const inner = size * 0.24;
  withAlpha(ctx, alpha, () => {
    ctx.fillStyle = token;
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.quadraticCurveTo(x + inner, y - inner, x + size, y);
    ctx.quadraticCurveTo(x + inner, y + inner, x, y + size);
    ctx.quadraticCurveTo(x - inner, y + inner, x - size, y);
    ctx.quadraticCurveTo(x - inner, y - inner, x, y - size);
    ctx.closePath();
    ctx.fill();
  });
}

/** Draws archival printmaker crop/registration corners framing the stage. */
export function drawRegistrationFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  token: string,
  alpha: number,
): void {
  const pad = 10;
  const len = 7;
  drawRule(ctx, pad, pad, pad + len, pad, token, alpha);
  drawRule(ctx, pad, pad, pad, pad + len, token, alpha);
  drawRule(ctx, w - pad, pad, w - pad - len, pad, token, alpha);
  drawRule(ctx, w - pad, pad, w - pad, pad + len, token, alpha);
  drawRule(ctx, pad, h - pad, pad + len, h - pad, token, alpha);
  drawRule(ctx, pad, h - pad, pad, h - pad - len, token, alpha);
  drawRule(ctx, w - pad, h - pad, w - pad - len, h - pad, token, alpha);
  drawRule(ctx, w - pad, h - pad, w - pad, h - pad - len, token, alpha);
}

/** Back atmospheric lighting plane: parallax studio lamp wash + subtle depth horizon. */
export function drawBackAtmosphere(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  px: number,
  py: number,
  charge: number,
  tokens: StageTokens,
): void {
  const lampX = w * 0.5 + px * 26;
  const lampY = h * 0.44 + py * 18;
  radialGlow(ctx, lampX, lampY, 128 + charge * 26, tokens.surface, 0.28);
  radialGlow(
    ctx,
    w * 0.5 - px * 32,
    h * 0.56 - py * 16,
    102 + charge * 22,
    tokens.accent,
    0.1 + charge * 0.14,
  );
}

/** Front theatrical plane: pointer foil shimmer ring, ambient floating motes, and hold-to-charge halo. */
export function drawFrontVignette(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cx: number,
  cy: number,
  t: number,
  idle: number,
  px: number,
  py: number,
  charge: number,
  tokens: StageTokens,
): void {
  // Subtle foreground bokeh dust shifting faster for 3-plane parallax
  const fade = easeOutCubic(seg(t, 0.15, 0.7));
  for (let i = 0; i < 6; i++) {
    const mx =
      lerp(24, w - 24, seeded(i, 91)) +
      px * (10 + i * 2) +
      Math.sin(t * 2.5 + idle * 0.9 + i * 1.7) * 3;
    const my =
      lerp(20, h - 20, seeded(i, 97)) +
      py * (8 + i * 1.5) -
      Math.cos(t * 2 + i * 1.3) * 2.5;
    drawDot(
      ctx,
      mx,
      my,
      1.1 + seeded(i, 101) * 1.1,
      i % 2 === 0 ? tokens.accent2 : tokens.accent,
      0.22 * fade,
    );
  }

  // Subtle foil rim highlight around the hero medallion when pointer moves across stage
  const pointerMag = Math.min(1, Math.hypot(px, py));
  if (pointerMag > 0.04) {
    const angle = Math.atan2(py, px);
    drawRing(
      ctx,
      cx + px * 4,
      cy + py * 3,
      33.5,
      tokens.accent2,
      0.42 * pointerMag,
      1.5,
      angle - 0.65,
      angle + 0.65,
    );
  }

  // Tactile hold-to-charge energy ring tightening around the medallion
  if (charge > 0.01) {
    const r = lerp(46, 33, easeOutCubic(charge));
    radialGlow(ctx, cx, cy, 48 + charge * 26, tokens.accent, 0.24 * charge);
    drawRing(
      ctx,
      cx,
      cy,
      r,
      tokens.accent,
      0.75 * charge,
      1.8,
      -Math.PI / 2,
      -Math.PI / 2 + TAU * charge,
    );
    drawRing(ctx, cx, cy, r + 5, tokens.accent2, 0.35 * charge, 1);
  }
}
