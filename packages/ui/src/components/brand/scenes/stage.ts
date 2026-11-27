// Bespoke Hidden Gem scenes: Stage play (proscenium, globetimber, velvetbox).
import {
  TAU,
  drawDot,
  drawRing,
  drawRule,
  easeOutCubic,
  lerp,
  radialGlow,
  seeded,
  seg,
  withAlpha,
} from "../gem-stage-primitives.ts";
import type { GemSceneSpec, SceneFrame } from "../gem-stage-types.ts";

function drawProscenium(
  ctx: CanvasRenderingContext2D,
  frame: SceneFrame,
): void {
  const { w, h, cx, cy, t, idle, tokens } = frame;
  const part = easeOutCubic(seg(t, 0.05, 0.72));
  const glow =
    easeOutCubic(seg(t, 0.25, 0.95)) *
    (1 + (idle > 0 ? Math.sin(idle * 2) * 0.04 * Math.exp(-idle * 0.45) : 0));

  drawRule(ctx, 20, h - 24, w - 20, h - 24, tokens.line, 0.55);
  radialGlow(ctx, cx, cy + 4, 78 * glow, tokens.accent2, 0.28 * glow);
  withAlpha(ctx, 0.26 * glow, () => {
    ctx.fillStyle = tokens.accent2;
    ctx.beginPath();
    ctx.ellipse(cx, h - 24, 62 * glow, 9 * glow, 0, 0, TAU);
    ctx.fill();
  });
  const curtainW = lerp(w * 0.46, 36, part);
  withAlpha(ctx, 0.34, () => {
    ctx.fillStyle = tokens.accent;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(curtainW, 0);
    ctx.quadraticCurveTo(curtainW * 0.72, h * 0.55, curtainW * 0.55, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w, 0);
    ctx.lineTo(w - curtainW, 0);
    ctx.quadraticCurveTo(w - curtainW * 0.72, h * 0.55, w - curtainW * 0.55, h);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  });
  drawDot(ctx, cx, cy - 10, 4 * glow, tokens.accent2, 0.9 * glow);
}

function drawGlobetimber(
  ctx: CanvasRenderingContext2D,
  frame: SceneFrame,
): void {
  const { w, h, cx, t, tokens } = frame;
  const sun = easeOutCubic(seg(t, 0, 0.7));

  drawRule(ctx, 18, 12, 54, h - 12, tokens.line, 0.55);
  drawRule(ctx, w - 18, 12, w - 54, h - 12, tokens.line, 0.55);
  drawRule(ctx, 18, h - 18, w - 18, h - 18, tokens.line, 0.55);
  const shift = lerp(-18, 8, sun);
  for (let s = 0; s < 2; s++) {
    const sx = 64 + s * 68 + shift;
    withAlpha(ctx, 0.2 * sun, () => {
      const grad = ctx.createLinearGradient(sx, 0, sx + 48, h);
      grad.addColorStop(0, tokens.accent2);
      grad.addColorStop(0.75, tokens.surface);
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx + 34, 0);
      ctx.lineTo(sx + 82, h);
      ctx.lineTo(sx + 40, h);
      ctx.closePath();
      ctx.fill();
    });
  }
  for (let i = 0; i < 8; i++) {
    drawDot(
      ctx,
      lerp(64, w - 64, seeded(i, 43)),
      lerp(24, h - 28, seeded(i, 47)) - t * 6,
      1.5,
      tokens.accent2,
      0.55 * sun,
    );
  }
  drawRule(
    ctx,
    cx - 44,
    h - 22,
    cx + 44 * sun,
    h - 22,
    tokens.accent,
    0.65 * sun,
    1.4,
  );
}

function drawVelvetbox(ctx: CanvasRenderingContext2D, frame: SceneFrame): void {
  const { w, h, cx, cy, t, tokens } = frame;
  const intro = easeOutCubic(seg(t, 0, 0.45));

  withAlpha(ctx, 0.45 * intro, () => {
    ctx.strokeStyle = tokens.line;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, w * 0.42, h * 0.41, 0, 0, TAU);
    ctx.stroke();
  });
  for (let i = 0; i < 7; i++) {
    const sx = cx - 72 + i * 24;
    const pluck = seg(t, 0.12 + i * 0.07, 0.82 + i * 0.025);
    const amp = Math.sin(pluck * TAU * 3) * (1 - pluck) * 6;
    withAlpha(ctx, 0.35 + 0.5 * (1 - pluck) * (pluck > 0 ? 1 : 0), () => {
      ctx.strokeStyle = i % 2 === 0 ? tokens.accent : tokens.accent2;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(sx, 20);
      ctx.quadraticCurveTo(sx + amp, cy, sx, h - 20);
      ctx.stroke();
    });
  }
  for (let r = 0; r < 2; r++) {
    const rp = seg(t, 0.28 + r * 0.22, 1);
    drawRing(
      ctx,
      cx,
      cy,
      lerp(24, 72, easeOutCubic(rp)),
      tokens.accent2,
      (1 - rp) * 0.48,
      1.1,
    );
  }
}

export const STAGE_SCENES = {
  proscenium: {
    stillT: 0.92,
    draw: drawProscenium,
    hero: {
      keyframes: [
        { opacity: 0.15, transform: "scale(0.86)" },
        { opacity: 1, transform: "scale(1.03)", offset: 0.7 },
        { opacity: 1, transform: "scale(1)" },
      ],
      options: {
        duration: 1550,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "both",
      },
    },
  },
  globetimber: {
    stillT: 0.9,
    draw: drawGlobetimber,
    hero: {
      keyframes: [
        {
          opacity: 0.2,
          transform: "rotate(-10deg) translateY(6px) scale(0.9)",
        },
        {
          opacity: 1,
          transform: "rotate(3deg) translateY(-2px) scale(1.03)",
          offset: 0.6,
        },
        { opacity: 1, transform: "rotate(0deg) translateY(0) scale(1)" },
      ],
      options: {
        duration: 1450,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "both",
      },
    },
  },
  velvetbox: {
    stillT: 0.9,
    draw: drawVelvetbox,
    hero: {
      keyframes: [
        { opacity: 0.2, transform: "translateY(8px) scale(0.9)" },
        { opacity: 1, transform: "translateY(-2px) scale(1.04)", offset: 0.65 },
        { opacity: 1, transform: "translateY(0) scale(1)" },
      ],
      options: {
        duration: 1450,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "both",
      },
    },
  },
} as const satisfies Record<string, GemSceneSpec>;
