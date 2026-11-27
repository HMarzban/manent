// Bespoke Hidden Gem scenes: Books (sylvan, clothbound, ambercourt, seaandink, copperplate).
import {
  TAU,
  drawDot,
  drawRing,
  drawRule,
  drawSpark,
  easeInOutSine,
  easeOutCubic,
  lerp,
  radialGlow,
  seeded,
  seg,
  withAlpha,
} from "../gem-stage-primitives.ts";
import type { GemSceneSpec, SceneFrame } from "../gem-stage-types.ts";

function drawSylvan(ctx: CanvasRenderingContext2D, frame: SceneFrame): void {
  const { w, h, cx, cy, t, idle, tokens } = frame;
  const glow = easeOutCubic(seg(t, 0, 0.7));

  radialGlow(ctx, cx, cy + 4, 78, tokens.accent2, 0.24 * glow);
  withAlpha(ctx, 0.55 * glow, () => {
    ctx.strokeStyle = tokens.line;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(42, h - 14);
    ctx.lineTo(42, 62);
    ctx.quadraticCurveTo(42, 22, cx, 14);
    ctx.quadraticCurveTo(w - 42, 22, w - 42, 62);
    ctx.lineTo(w - 42, h - 14);
    ctx.stroke();
  });
  for (let i = 0; i < 8; i++) {
    const base = seeded(i, 31);
    const x =
      lerp(58, w - 58, seeded(i, 37)) + Math.sin(t * 4 + i * 1.4 + idle) * 7;
    const y = lerp(h - 24, 24, (base * 0.5 + t * 0.55) % 1);
    const a = Math.sin(((base + t) % 1) * Math.PI) * 0.85;
    drawDot(ctx, x, y, 1.8 + seeded(i, 41), tokens.accent2, a);
    radialGlow(ctx, x, y, 7, tokens.accent2, a * 0.35);
  }
}

function drawClothbound(
  ctx: CanvasRenderingContext2D,
  frame: SceneFrame,
): void {
  const { w, h, cx, cy, t, tokens } = frame;
  const spread = easeOutCubic(seg(t, 0.05, 0.7));
  const ribbon = easeOutCubic(seg(t, 0.35, 0.92));

  withAlpha(ctx, 0.55 * spread, () => {
    ctx.strokeStyle = tokens.line;
    ctx.lineWidth = 1;
    ctx.strokeRect(20, 14, w - 40, h - 28);
    ctx.strokeRect(24, 18, w - 48, h - 36);
  });
  for (let i = 1; i <= 3; i++) {
    const span = i * 24 * spread;
    withAlpha(ctx, (0.55 - i * 0.12) * spread, () => {
      ctx.strokeStyle = i === 1 ? tokens.accent : tokens.muted;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx, cy + 28);
      ctx.quadraticCurveTo(cx - span, cy - 22, cx - span - 14, cy + 16);
      ctx.moveTo(cx, cy + 28);
      ctx.quadraticCurveTo(cx + span, cy - 22, cx + span + 14, cy + 16);
      ctx.stroke();
    });
  }
  const ry = lerp(18, h - 22, ribbon);
  withAlpha(ctx, 0.8 * ribbon, () => {
    ctx.fillStyle = tokens.accent2;
    ctx.beginPath();
    ctx.moveTo(cx - 3.5, 18);
    ctx.lineTo(cx + 3.5, 18);
    ctx.lineTo(cx + 3.5, ry);
    ctx.lineTo(cx, ry - 5);
    ctx.lineTo(cx - 3.5, ry);
    ctx.closePath();
    ctx.fill();
  });
}

function drawAmbercourt(
  ctx: CanvasRenderingContext2D,
  frame: SceneFrame,
): void {
  const { w, h, cx, cy, t, idle, tokens } = frame;
  const circuit = easeOutCubic(seg(t, 0, 0.85));
  const rot = idle * 0.1 * Math.exp(-idle * 0.45);

  for (let i = -3; i <= 3; i++) {
    drawRule(
      ctx,
      cx + i * 24,
      h * 0.62,
      cx + i * 52,
      h - 10,
      tokens.line,
      0.35 * circuit,
    );
  }
  drawRule(ctx, 26, h * 0.68, w - 26, h * 0.68, tokens.line, 0.35 * circuit);
  drawRule(ctx, 18, h * 0.82, w - 18, h * 0.82, tokens.line, 0.35 * circuit);
  radialGlow(ctx, cx, cy, 68, tokens.accent2, 0.16 * circuit);
  for (let r = 0; r < 3; r++) {
    const rp = easeOutCubic(seg(t, r * 0.18, 0.55 + r * 0.18));
    drawRing(
      ctx,
      cx,
      cy,
      34 + r * 14,
      r === 1 ? tokens.accent2 : tokens.accent,
      0.52 * rp,
      1.3,
      rot,
      rot + TAU * rp,
    );
  }
  drawSpark(
    ctx,
    cx,
    cy - 38,
    7 * easeInOutSine(seg(t, 0.55, 1)),
    tokens.accent2,
    0.85,
  );
}

function drawSeaandink(ctx: CanvasRenderingContext2D, frame: SceneFrame): void {
  const { w, h, cx, cy, t, idle, tokens } = frame;
  const chart = easeOutCubic(seg(t, 0, 0.6));

  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    drawRule(
      ctx,
      cx,
      cy,
      cx + Math.cos(a) * 130 * chart,
      cy + Math.sin(a) * 84 * chart,
      tokens.line,
      i % 4 === 0 ? 0.5 : 0.22,
    );
  }
  drawRing(ctx, cx, cy, 52, tokens.accent, 0.48 * chart, 1.2);
  drawDot(ctx, cx, cy - 52, 3, tokens.accent2, 0.9 * chart);
  for (let wave = 0; wave < 3; wave++) {
    const wy = h - 26 + wave * 7;
    withAlpha(ctx, (0.45 - wave * 0.1) * chart, () => {
      ctx.strokeStyle = wave === 0 ? tokens.accent : tokens.muted;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let x = 22; x <= w - 22; x += 6) {
        const y =
          wy + Math.sin(x * 0.06 + wave * 1.3 + t * 4 + idle * 1.4) * 2.5;
        if (x === 22) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
  }
}

function drawCopperplate(
  ctx: CanvasRenderingContext2D,
  frame: SceneFrame,
): void {
  const { w, h, t, tokens } = frame;
  const plate = easeOutCubic(seg(t, 0, 0.45));
  const loop = easeOutCubic(seg(t, 0.2, 0.9));

  withAlpha(ctx, 0.6 * plate, () => {
    ctx.strokeStyle = tokens.line;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(18, 14, w - 36, h - 28);
    ctx.strokeRect(23, 19, w - 46, h - 38);
  });
  for (let x = 36; x < w - 36; x += 26) {
    drawRule(ctx, x, h - 24, x + 22, 24, tokens.line, 0.22 * plate);
  }
  withAlpha(ctx, 0.82 * plate, () => {
    ctx.strokeStyle = tokens.accent;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    const steps = Math.max(2, Math.floor(42 * loop));
    for (let i = 0; i <= steps; i++) {
      const f = i / 42;
      const fx = lerp(38, w - 38, f);
      const fy = h - 30 + Math.sin(f * TAU * 1.5) * 7 * Math.sin(f * Math.PI);
      if (i === 0) ctx.moveTo(fx, fy);
      else ctx.lineTo(fx, fy);
    }
    ctx.stroke();
  });
  drawDot(ctx, lerp(38, w - 38, loop), h - 30, 2.5, tokens.accent2, 0.9 * loop);
}

export const BOOKS_SCENES = {
  sylvan: {
    stillT: 0.9,
    draw: drawSylvan,
    hero: {
      keyframes: [
        { opacity: 0.2, transform: "translateY(10px) scale(0.9)" },
        { opacity: 1, transform: "translateY(0) scale(1)" },
      ],
      options: {
        duration: 1550,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "both",
      },
    },
  },
  clothbound: {
    stillT: 0.92,
    draw: drawClothbound,
    hero: {
      keyframes: [
        { opacity: 0.2, transform: "scaleX(0.84) scaleY(0.95)" },
        { opacity: 1, transform: "scaleX(1.04) scaleY(1.01)", offset: 0.65 },
        { opacity: 1, transform: "scale(1)" },
      ],
      options: {
        duration: 1400,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "both",
      },
    },
  },
  ambercourt: {
    stillT: 0.94,
    draw: drawAmbercourt,
    hero: {
      keyframes: [
        { opacity: 0.2, transform: "translateY(12px) scale(0.88)" },
        { opacity: 1, transform: "translateY(-2px) scale(1.03)", offset: 0.68 },
        { opacity: 1, transform: "translateY(0) scale(1)" },
      ],
      options: {
        duration: 1450,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "both",
      },
    },
  },
  seaandink: {
    stillT: 0.92,
    draw: drawSeaandink,
    hero: {
      keyframes: [
        { opacity: 0.25, transform: "rotate(-28deg) scale(0.9)" },
        { opacity: 1, transform: "rotate(10deg) scale(1.03)", offset: 0.48 },
        { opacity: 1, transform: "rotate(-4deg) scale(1)", offset: 0.74 },
        { opacity: 1, transform: "rotate(0deg) scale(1)" },
      ],
      options: {
        duration: 1650,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "both",
      },
    },
  },
  copperplate: {
    stillT: 0.92,
    draw: drawCopperplate,
    hero: {
      keyframes: [
        {
          opacity: 0.2,
          transform: "translate(-8px, 4px) rotate(-10deg) scale(0.9)",
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
} as const satisfies Record<string, GemSceneSpec>;
