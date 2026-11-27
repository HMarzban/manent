// Bespoke Hidden Gem scenes: Space (hyperdrive, starfleet).
import {
  TAU,
  drawDot,
  drawRing,
  drawRule,
  drawSpark,
  easeOutCubic,
  lerp,
  radialGlow,
  seeded,
  seg,
  withAlpha,
} from "../gem-stage-primitives.ts";
import type { GemSceneSpec, SceneFrame } from "../gem-stage-types.ts";

function drawHyperdrive(
  ctx: CanvasRenderingContext2D,
  frame: SceneFrame,
): void {
  const { w, h, cx, cy, t, idle, tokens } = frame;
  const horizonY = h * 0.73;
  const rise = easeOutCubic(seg(t, 0, 0.65));
  const warp = Math.sin(seg(t, 0.08, 0.72) * Math.PI);
  const pulse =
    1 + (idle > 0 ? Math.sin(idle * 2.2) * 0.04 * Math.exp(-idle * 0.45) : 0);

  radialGlow(
    ctx,
    cx + 44,
    horizonY - 36,
    74 * pulse,
    tokens.accent,
    0.22 * rise,
  );
  radialGlow(
    ctx,
    cx - 42,
    horizonY - 22,
    54 * pulse,
    tokens.accent2,
    0.18 * rise,
  );
  drawDot(
    ctx,
    cx + 46,
    lerp(horizonY + 14, horizonY - 38, rise),
    17,
    tokens.accent,
    0.42 * rise,
  );
  drawDot(
    ctx,
    cx - 44,
    lerp(horizonY + 18, horizonY - 22, rise),
    11,
    tokens.accent2,
    0.48 * rise,
  );
  drawRing(
    ctx,
    cx + 46,
    lerp(horizonY + 14, horizonY - 38, rise),
    23 * rise,
    tokens.accent,
    0.24 * rise,
  );
  for (let i = 0; i < 22; i++) {
    const angle = (i / 22) * TAU + seeded(i, 3) * 0.22;
    const dist = lerp(24, 138, seeded(i, 7));
    const len = lerp(4, 28, warp) * (0.5 + seeded(i, 9) * 0.5);
    const r1 = dist - len * 0.4;
    const r2 = dist + len * 0.6;
    drawRule(
      ctx,
      cx + Math.cos(angle) * r1,
      cy + Math.sin(angle) * r1 * 0.72,
      cx + Math.cos(angle) * r2,
      cy + Math.sin(angle) * r2 * 0.72,
      i % 3 === 0 ? tokens.accent2 : tokens.muted,
      0.22 + 0.35 * warp,
      1.1,
    );
  }
  drawRule(ctx, 18, horizonY, w - 18, horizonY, tokens.line, 0.75 * rise);
  const flash = Math.sin(seg(t, 0.38, 0.85) * Math.PI);
  drawSpark(ctx, cx, cy, 18 * flash, tokens.accent, 0.65 * flash);
}

function drawStarfleet(ctx: CanvasRenderingContext2D, frame: SceneFrame): void {
  const { w, h, cx, cy, t, idle, tokens } = frame;
  const frameIn = easeOutCubic(seg(t, 0, 0.5));
  const lock = easeOutCubic(seg(t, 0.35, 0.92));
  const rot =
    lerp(-0.55, 0, lock) +
    (idle > 0 ? idle * 0.08 * Math.exp(-idle * 0.45) : 0);

  radialGlow(ctx, cx, cy, 78, tokens.accent, 0.14 * frameIn);
  withAlpha(ctx, 0.58 * frameIn, () => {
    ctx.strokeStyle = tokens.accent;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(22, lerp(22, h - 22, frameIn));
    ctx.lineTo(22, 26);
    ctx.quadraticCurveTo(22, 18, 30, 18);
    ctx.lineTo(lerp(30, w - 68, frameIn), 18);
    ctx.stroke();
  });
  for (let p = 0; p < 3; p++) {
    const on = easeOutCubic(seg(t, 0.25 + p * 0.14, 0.55 + p * 0.14));
    withAlpha(ctx, 0.75 * on, () => {
      ctx.fillStyle = p === 1 ? tokens.accent2 : tokens.accent;
      ctx.beginPath();
      ctx.roundRect(w - 58 + p * 14, 15, 10, 5, 2.5);
      ctx.fill();
    });
  }
  drawRule(ctx, 36, cy, w - 24, cy, tokens.line, 0.32 * frameIn);
  drawRule(ctx, cx, 28, cx, h - 18, tokens.line, 0.32 * frameIn);
  drawRing(
    ctx,
    cx,
    cy,
    46,
    tokens.accent,
    0.52 * lock,
    1.2,
    rot,
    rot + Math.PI * 0.7,
  );
  drawRing(
    ctx,
    cx,
    cy,
    46,
    tokens.accent2,
    0.52 * lock,
    1.2,
    rot + Math.PI,
    rot + Math.PI * 1.7,
  );
  drawRing(ctx, cx, cy, 58, tokens.line, 0.45 * lock, 1);
  withAlpha(ctx, 0.5 * lock, () => {
    ctx.strokeStyle = tokens.accent2;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(34, h - 18);
    ctx.quadraticCurveTo(cx - 24, cy + 28, cx, cy);
    ctx.stroke();
    ctx.setLineDash([]);
  });
}

export const SPACE_SCENES = {
  hyperdrive: {
    stillT: 0.9,
    draw: drawHyperdrive,
    hero: {
      keyframes: [
        { opacity: 0.15, transform: "scale(0.74) rotate(-12deg)" },
        { opacity: 1, transform: "scale(1.1) rotate(4deg)", offset: 0.58 },
        { opacity: 1, transform: "scale(1) rotate(0deg)" },
      ],
      options: {
        duration: 1350,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "both",
      },
    },
  },
  starfleet: {
    stillT: 0.95,
    draw: drawStarfleet,
    hero: {
      keyframes: [
        {
          opacity: 0.2,
          transform: "translate(-22px, 14px) rotate(-18deg) scale(0.8)",
        },
        {
          opacity: 1,
          transform: "translate(2px, -2px) rotate(3deg) scale(1.04)",
          offset: 0.72,
        },
        { opacity: 1, transform: "translate(0, 0) rotate(0deg) scale(1)" },
      ],
      options: {
        duration: 1500,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "both",
      },
    },
  },
} as const satisfies Record<string, GemSceneSpec>;
