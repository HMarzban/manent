// Bespoke Hidden Gem scenes: Audio & Games (soundbooth, reeltoreel, nightfreq, chiaroscuro, nocturne).
import {
  TAU,
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

function drawSoundbooth(
  ctx: CanvasRenderingContext2D,
  frame: SceneFrame,
): void {
  const { w, cx, cy, t, idle, tokens } = frame;
  const intro = easeOutCubic(seg(t, 0, 0.45));
  const settle = idle > 0 ? Math.exp(-idle * 0.45) : 1;

  // Acoustic foam chevron wall pattern
  for (let x = 22; x < w - 22; x += 24) {
    drawRule(ctx, x, 18, x + 12, 30, tokens.line, 0.25 * intro);
    drawRule(ctx, x + 12, 30, x + 24, 18, tokens.line, 0.25 * intro);
  }
  // Twin symmetric studio voice-level waveform bars peaking calmly at -12 dB
  const bars = 6;
  for (let i = 0; i < bars; i++) {
    const wave =
      0.42 + 0.58 * Math.abs(Math.sin(t * 7 + i * 0.9 + idle * 2)) * settle;
    const bh = lerp(12, 56, wave) * intro;
    const offset = 46 + i * 11;
    const token = i >= 4 ? tokens.accent2 : tokens.accent;
    drawRule(
      ctx,
      cx - offset,
      cy + bh / 2,
      cx - offset,
      cy - bh / 2,
      token,
      0.72,
      3.2,
    );
    drawRule(
      ctx,
      cx + offset,
      cy + bh / 2,
      cx + offset,
      cy - bh / 2,
      token,
      0.72,
      3.2,
    );
  }
  // Serene studio ready beacon dot at upper-right
  drawDot(ctx, w - 28, 22, 3.2, tokens.accent2, 0.85 * intro);
  radialGlow(ctx, w - 28, 22, 11, tokens.accent2, 0.35 * intro);
}

function drawReeltoreel(
  ctx: CanvasRenderingContext2D,
  frame: SceneFrame,
): void {
  const { w, h, cx, cy, t, idle, tokens } = frame;
  const spin = t * 5.2 + idle * 1.4 * Math.exp(-idle * 0.4);
  const intro = easeOutCubic(seg(t, 0, 0.5));

  // Twin counter-rotating 3-spoke NAB tape reels flanking the hero deck
  const reels: readonly number[] = [cx - 72, cx + 72];
  for (const rx of reels) {
    drawRing(ctx, rx, cy - 6, 26, tokens.line, 0.7 * intro, 1.4);
    drawRing(ctx, rx, cy - 6, 17, tokens.accent2, 0.42 * intro, 1.1);
    for (let s = 0; s < 3; s++) {
      const a = spin + (s / 3) * TAU;
      drawRule(
        ctx,
        rx + Math.cos(a) * 6,
        cy - 6 + Math.sin(a) * 6,
        rx + Math.cos(a) * 24,
        cy - 6 + Math.sin(a) * 24,
        tokens.muted,
        0.58 * intro,
        1.4,
      );
    }
    drawDot(ctx, rx, cy - 6, 4, tokens.accent, 0.75 * intro);
  }
  // Taut oxide-tape ribbon across the heads
  drawRule(
    ctx,
    cx - 72,
    cy + 20,
    cx + 72,
    cy + 20,
    tokens.accent2,
    0.7 * intro,
    1.5,
  );
  // Twin analogue VU meter arcs + swinging steady needles below
  for (const vx of [cx - 46, cx + 46]) {
    drawRing(
      ctx,
      vx,
      h - 10,
      22,
      tokens.line,
      0.65 * intro,
      1.2,
      Math.PI * 1.15,
      Math.PI * 1.85,
    );
    const needleA = lerp(
      Math.PI * 1.25,
      Math.PI * 1.56,
      easeOutBack(seg(t, 0.2, 0.85)),
    );
    drawRule(
      ctx,
      vx,
      h - 10,
      vx + Math.cos(needleA) * 20,
      h - 10 + Math.sin(needleA) * 20,
      tokens.accent,
      0.9 * intro,
      1.5,
    );
  }
  // Subtle deck baseline
  drawRule(ctx, 24, h - 10, w - 24, h - 10, tokens.line, 0.45);
}

function drawNightfreq(ctx: CanvasRenderingContext2D, frame: SceneFrame): void {
  const { w, h, cx, cy, t, idle, tokens } = frame;
  const sweep = t * TAU + idle * 0.45 * Math.exp(-idle * 0.45);
  const intro = easeOutCubic(seg(t, 0, 0.4));

  // Concentric midnight tuner dial rings + frequency graduations
  for (let r = 24; r <= 66; r += 14) {
    drawRing(ctx, cx, cy, r, tokens.line, 0.42 * intro);
  }
  drawRule(ctx, 22, h - 18, w - 22, h - 18, tokens.line, 0.55 * intro);
  // Conical phosphor sweep beam rotating 360 degrees
  withAlpha(ctx, 0.28 * intro, () => {
    ctx.fillStyle = tokens.accent;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, 66, sweep - 0.65, sweep);
    ctx.closePath();
    ctx.fill();
  });
  drawRule(
    ctx,
    cx,
    cy,
    cx + Math.cos(sweep) * 66,
    cy + Math.sin(sweep) * 66,
    tokens.accent,
    0.85 * intro,
    1.4,
  );
  // Three distant midnight phosphor blips with gentle afterglow
  const blips: readonly [number, number, number][] = [
    [cx + 34, cy - 28, 0.25],
    [cx - 42, cy - 16, 0.52],
    [cx + 26, cy + 32, 0.72],
  ];
  for (const [bx, by, at] of blips) {
    const lit = easeOutCubic(seg(t, at, at + 0.25));
    drawDot(ctx, bx, by, 2.8, tokens.accent2, 0.9 * lit);
    radialGlow(ctx, bx, by, 10, tokens.accent2, 0.42 * lit);
  }
}

function drawChiaroscuro(
  ctx: CanvasRenderingContext2D,
  frame: SceneFrame,
): void {
  const { w, h, cx, cy, t, tokens } = frame;
  const grid = easeOutCubic(seg(t, 0, 0.45));
  const burst = Math.sin(seg(t, 0.42, 0.95) * Math.PI);
  const settle = easeOutCubic(seg(t, 0.4, 0.95));

  // Vignetted tabletop graph-paper grid
  for (let x = 24; x < w - 18; x += 16) {
    drawRule(ctx, x, 16, x, h - 16, tokens.line, 0.24 * grid);
  }
  for (let y = 16; y < h - 14; y += 16) {
    drawRule(ctx, 24, y, w - 24, y, tokens.line, 0.24 * grid);
  }
  // Rotating polygonal gilded facet star blooming when landing on natural 20
  radialGlow(ctx, cx, cy, 74, tokens.accent2, 0.22 * settle);
  const sides = 6;
  const r = lerp(26, 52, settle);
  const rot = lerp(-0.5, 0, settle);
  withAlpha(ctx, 0.62 * settle, () => {
    ctx.strokeStyle = tokens.accent2;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i <= sides; i++) {
      const a = rot + (i / sides) * TAU - Math.PI / 2;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU - Math.PI / 2;
    drawSpark(
      ctx,
      cx + Math.cos(a) * 52,
      cy + Math.sin(a) * 52,
      6 * (0.45 + 0.55 * burst),
      tokens.accent,
      0.75 * settle,
    );
  }
}

function drawNocturne(ctx: CanvasRenderingContext2D, frame: SceneFrame): void {
  const { w, h, cx, cy, t, idle, tokens } = frame;
  const intro = easeOutCubic(seg(t, 0, 0.6));
  const orbitA =
    lerp(-2.2, 0.45, easeInOutSine(t)) + idle * 0.22 * Math.exp(-idle * 0.45);

  // Subtle four-way crossroads compass axes
  drawRule(ctx, 24, cy, w - 24, cy, tokens.line, 0.28 * intro);
  drawRule(ctx, cx, 16, cx, h - 16, tokens.line, 0.28 * intro);
  // Pinpoint twilight stars appearing in staggered calm
  for (let i = 0; i < 14; i++) {
    const sx = lerp(24, w - 24, seeded(i, 53));
    const sy = lerp(18, h - 46, seeded(i, 59));
    const a = easeOutCubic(seg(t, seeded(i, 61) * 0.5, 0.85)) * 0.65;
    drawDot(ctx, sx, sy, 1 + seeded(i, 67), tokens.muted, a);
  }
  // Dashed tilted celestial orbit + luminous satellite orb
  radialGlow(ctx, cx, cy, 64, tokens.accent, 0.16 * intro);
  withAlpha(ctx, 0.55 * intro, () => {
    ctx.strokeStyle = tokens.accent2;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.ellipse(cx, cy, 68, 28, -0.22, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  });
  const ox = Math.cos(orbitA) * 68;
  const oy = Math.sin(orbitA) * 28;
  const cosT = Math.cos(-0.22);
  const sinT = Math.sin(-0.22);
  const mx = cx + ox * cosT - oy * sinT;
  const my = cy + ox * sinT + oy * cosT;
  drawDot(ctx, mx, my, 4.2, tokens.accent, 0.95);
  radialGlow(ctx, mx, my, 14, tokens.accent, 0.45);
  // Drifting layered nocturnal sea-mist curves along the lower horizon
  for (let band = 0; band < 2; band++) {
    const by = h - 22 + band * 9;
    withAlpha(ctx, (0.35 - band * 0.1) * intro, () => {
      ctx.strokeStyle = tokens.surface;
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let x = 16; x <= w - 16; x += 8) {
        const y =
          by + Math.sin(x * 0.045 + (band === 0 ? t * 2.4 : -t * 2)) * 3.5;
        if (x === 16) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
  }
}

export const AUDIO_GAMES_SCENES = {
  soundbooth: {
    stillT: 0.88,
    draw: drawSoundbooth,
    hero: {
      keyframes: [
        { opacity: 0.2, transform: "translateY(9px) scale(0.9)" },
        { opacity: 1, transform: "translateY(-3px) scale(1.04)", offset: 0.55 },
        { opacity: 1, transform: "translateY(0) scale(1)" },
      ],
      options: {
        duration: 1350,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "both",
      },
    },
  },
  reeltoreel: {
    stillT: 0.9,
    draw: drawReeltoreel,
    hero: {
      keyframes: [
        { opacity: 0.25, transform: "scale(0.9)" },
        { opacity: 1, transform: "scale(1.04)", offset: 0.6 },
        { opacity: 1, transform: "scale(1)" },
      ],
      options: {
        duration: 1350,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "both",
      },
    },
  },
  nightfreq: {
    stillT: 0.86,
    draw: drawNightfreq,
    hero: {
      keyframes: [
        { opacity: 0.2, transform: "rotate(-30deg) scale(0.88)" },
        { opacity: 1, transform: "rotate(0deg) scale(1)" },
      ],
      options: {
        duration: 1500,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "both",
      },
    },
  },
  chiaroscuro: {
    stillT: 0.92,
    draw: drawChiaroscuro,
    hero: {
      keyframes: [
        {
          opacity: 0.2,
          transform: "translate(-10px, -8px) rotate(-42deg) scale(0.8)",
        },
        {
          opacity: 1,
          transform: "translate(2px, 2px) rotate(8deg) scale(1.08)",
          offset: 0.58,
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
  nocturne: {
    stillT: 0.92,
    draw: drawNocturne,
    hero: {
      keyframes: [
        {
          opacity: 0.2,
          transform: "rotate(-10deg) translateY(6px) scale(0.9)",
        },
        { opacity: 1, transform: "rotate(0deg) translateY(0) scale(1)" },
      ],
      options: {
        duration: 1600,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "both",
      },
    },
  },
} as const satisfies Record<string, GemSceneSpec>;
