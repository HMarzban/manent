// Bespoke Hidden Gem scenes: Cinema (studio, celluloid, nightwire).
import {
  drawDot,
  drawRing,
  drawRule,
  drawSpark,
  easeInOutSine,
  easeOutBack,
  easeOutCubic,
  lerp,
  radialGlow,
  seeded,
  seg,
  withAlpha,
} from "../gem-stage-primitives.ts";
import type { GemSceneSpec, SceneFrame } from "../gem-stage-types.ts";

function drawStudio(ctx: CanvasRenderingContext2D, frame: SceneFrame): void {
  const { w, h, cx, cy, t, idle, tokens } = frame;
  const sheetIn = easeOutCubic(seg(t, 0, 0.45));
  const inkDraw = easeOutCubic(seg(t, 0.22, 0.82));
  const glint =
    Math.sin(seg(t, 0.65, 1) * Math.PI) * 0.8 +
    (idle > 0 ? 0.35 * Math.exp(-idle * 0.5) : 0);

  radialGlow(ctx, cx, cy, 88, tokens.accent, 0.12 * sheetIn);
  const sx = 54;
  const sy = lerp(h + 10, 22, sheetIn);
  const sw = w - 108;
  const sh = h - 38;
  withAlpha(ctx, 0.9 * sheetIn, () => {
    ctx.fillStyle = tokens.surface;
    ctx.strokeStyle = tokens.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(sx, sy, sw, sh, 4);
    ctx.fill();
    ctx.stroke();
  });
  drawRule(
    ctx,
    sx + 22,
    sy + 6,
    sx + 22,
    sy + sh - 6,
    tokens.line,
    0.5 * sheetIn,
  );
  for (let i = 0; i < 3; i++) {
    const py = sy + 22 + i * 35;
    drawDot(ctx, sx + 11, py, 3.2, tokens.desk, 0.9 * sheetIn);
    drawRing(ctx, sx + 11, py, 3.2, tokens.line, 0.8 * sheetIn);
    if (i !== 1) {
      const bradScale = easeOutBack(seg(t, 0.2 + i * 0.08, 0.55 + i * 0.08));
      drawDot(ctx, sx + 11, py, 2.3 * bradScale, tokens.accent2, 0.95);
    }
  }
  for (let r = 0; r < 3; r++) {
    const rw =
      (r === 0 ? 52 : r === 1 ? 86 : 64) *
      easeOutCubic(seg(t, 0.25 + r * 0.1, 0.7 + r * 0.1));
    drawRule(
      ctx,
      sx + 34,
      sy + 26 + r * 14,
      sx + 34 + rw,
      sy + 26 + r * 14,
      tokens.muted,
      0.32,
      2,
    );
  }
  const lineEnd = lerp(sx + 34, sx + sw - 20, inkDraw);
  drawRule(
    ctx,
    sx + 34,
    sy + sh - 22,
    lineEnd,
    sy + sh - 22,
    tokens.accent,
    0.85,
    1.8,
  );
  drawSpark(ctx, lineEnd, sy + sh - 22, 6 * glint, tokens.accent, glint);
}

function drawCelluloid(ctx: CanvasRenderingContext2D, frame: SceneFrame): void {
  const { w, h, cx, cy, t, idle, tokens } = frame;
  const gate = easeOutCubic(seg(t, 0, 0.55));
  const scroll = (t * 58 + idle * 14 * Math.exp(-idle * 0.4)) % 18;

  drawRule(ctx, 26, 8, 26, h - 8, tokens.line, 0.6 * gate);
  drawRule(ctx, w - 26, 8, w - 26, h - 8, tokens.line, 0.6 * gate);
  for (let y = -18; y < h + 18; y += 18) {
    const yy = y + scroll;
    withAlpha(ctx, 0.52 * gate, () => {
      ctx.fillStyle = tokens.surface;
      ctx.strokeStyle = tokens.line;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.roundRect(12, yy, 9, 10, 2);
      ctx.roundRect(w - 21, yy, 9, 10, 2);
      ctx.fill();
      ctx.stroke();
    });
  }
  const flicker = 0.88 + 0.12 * Math.sin(t * 28);
  withAlpha(ctx, 0.24 * gate * flicker, () => {
    const grad = ctx.createLinearGradient(cx - 10, cy, w - 26, cy);
    grad.addColorStop(0, tokens.accent);
    grad.addColorStop(0.65, tokens.accent2);
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy - 8);
    ctx.lineTo(w - 28, 16);
    ctx.lineTo(w - 28, h - 16);
    ctx.lineTo(cx - 8, cy + 8);
    ctx.closePath();
    ctx.fill();
  });
  for (let i = 0; i < 12; i++) {
    const mx = lerp(cx + 12, w - 38, seeded(i, 11));
    const my = lerp(26, h - 26, seeded(i, 13)) + Math.sin(t * 4 + i) * 4;
    drawDot(ctx, mx, my, 1.3 + seeded(i, 17), tokens.accent2, 0.5 * gate);
  }
  const crop = easeOutCubic(seg(t, 0.45, 0.9));
  const bx = 40;
  const by = 22;
  drawRule(ctx, bx, by, bx + 12, by, tokens.accent2, 0.65 * crop, 1.3);
  drawRule(ctx, bx, by, bx, by + 10, tokens.accent2, 0.65 * crop, 1.3);
  drawRule(
    ctx,
    w - bx,
    h - by,
    w - bx - 12,
    h - by,
    tokens.accent2,
    0.65 * crop,
    1.3,
  );
  drawRule(
    ctx,
    w - bx,
    h - by,
    w - bx,
    h - by - 10,
    tokens.accent2,
    0.65 * crop,
    1.3,
  );
}

function drawNightwire(ctx: CanvasRenderingContext2D, frame: SceneFrame): void {
  const { w, h, cx, cy, t, idle, tokens } = frame;
  const scan = easeOutCubic(seg(t, 0.1, 0.85));
  const rainShift = t * 90 + idle * 26 * Math.exp(-idle * 0.4);

  for (let y = 14; y < h - 10; y += 8) {
    drawRule(ctx, 14, y, w - 14, y, tokens.line, 0.16);
  }
  radialGlow(ctx, cx, cy, 68, tokens.accent, 0.16 * scan);
  drawRing(ctx, cx, cy, lerp(16, 48, scan), tokens.accent, 0.55 * scan, 1.2);
  drawRing(
    ctx,
    cx,
    cy,
    lerp(28, 62, easeInOutSine(seg(t, 0.25, 1))),
    tokens.accent2,
    0.34 * scan,
    1,
  );
  for (let i = 0; i < 20; i++) {
    const x0 = seeded(i, 21) * (w + 40) - 20;
    const len = 12 + seeded(i, 23) * 18;
    const y0 =
      ((seeded(i, 25) * h + rainShift * (0.7 + seeded(i, 29) * 0.6)) %
        (h + 30)) -
      15;
    drawRule(
      ctx,
      x0,
      y0,
      x0 - len * 0.24,
      y0 + len,
      i % 4 === 0 ? tokens.accent : tokens.muted,
      0.22 + (i % 4 === 0 ? 0.24 : 0),
      1,
    );
  }
}

export const CINEMA_SCENES = {
  studio: {
    stillT: 0.92,
    draw: drawStudio,
    hero: {
      keyframes: [
        {
          opacity: 0.2,
          transform: "translate(-10px, -8px) rotate(-14deg) scale(0.86)",
        },
        {
          opacity: 1,
          transform: "translate(3px, 2px) rotate(3deg) scale(1.04)",
          offset: 0.68,
        },
        { opacity: 1, transform: "translate(0, 0) rotate(0deg) scale(1)" },
      ],
      options: {
        duration: 1450,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "both",
      },
    },
  },
  celluloid: {
    stillT: 0.88,
    draw: drawCelluloid,
    hero: {
      keyframes: [
        { opacity: 0.2, transform: "translateX(-12px) scale(0.86)" },
        { opacity: 1, transform: "translateX(2px) scale(1.05)", offset: 0.62 },
        { opacity: 1, transform: "translateX(0) scale(1)" },
      ],
      options: {
        duration: 1450,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "both",
      },
    },
  },
  nightwire: {
    stillT: 0.9,
    draw: drawNightwire,
    hero: {
      keyframes: [
        { opacity: 0.15, transform: "translateY(8px) scale(0.88)" },
        { opacity: 1, transform: "translateY(-3px) scale(1.04)", offset: 0.65 },
        { opacity: 1, transform: "translateY(0) scale(1)" },
      ],
      options: {
        duration: 1550,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "both",
      },
    },
  },
} as const satisfies Record<string, GemSceneSpec>;
