// Bespoke Hidden Gem scenes: TV & Broadcast Press (viridian, marquee, newsdesk, breakingdesk, broadsheet, telegraph).
import {
  TAU,
  drawDot,
  drawRing,
  drawRule,
  drawSpark,
  easeOutBack,
  easeOutCubic,
  lerp,
  radialGlow,
  seg,
  withAlpha,
} from "../gem-stage-primitives.ts";
import type { GemSceneSpec, SceneFrame } from "../gem-stage-types.ts";

function drawViridian(ctx: CanvasRenderingContext2D, frame: SceneFrame): void {
  const { h, cx, cy, t, tokens } = frame;
  const open = easeOutCubic(seg(t, 0, 0.55));
  const trace = easeOutCubic(seg(t, 0.25, 0.95));

  // Sterile one-point perspective architectural corridor lines
  for (let i = -3; i <= 3; i++) {
    const ex = cx + i * 52;
    drawRule(ctx, cx, cy, ex, 0, tokens.line, 0.35 * open);
    drawRule(ctx, cx, cy, ex, h, tokens.line, 0.35 * open);
  }
  for (let d = 1; d <= 3; d++) {
    const rw = d * 56 * open;
    const rh = d * 32 * open;
    withAlpha(ctx, 0.42 * open, () => {
      ctx.strokeStyle = tokens.line;
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - rw / 2, cy - rh / 2, rw, rh);
    });
  }
  radialGlow(ctx, cx, cy, 56, tokens.accent, 0.14 * open);
  // Clinical telemetry bead tracing the rectilinear perimeter
  const box = 44;
  const p = (trace * 4) % 4;
  const bx =
    p < 1
      ? lerp(cx - box, cx + box, p)
      : p < 2
        ? cx + box
        : p < 3
          ? lerp(cx + box, cx - box, p - 2)
          : cx - box;
  const by =
    p < 1
      ? cy - box
      : p < 2
        ? lerp(cy - box, cy + box, p - 1)
        : p < 3
          ? cy + box
          : lerp(cy + box, cy - box, p - 3);
  drawDot(ctx, bx, by, 3, tokens.accent, 0.95);
  radialGlow(ctx, bx, by, 12, tokens.accent, 0.4);
}

function drawMarquee(ctx: CanvasRenderingContext2D, frame: SceneFrame): void {
  const { w, h, cx, cy, t, idle, tokens } = frame;
  const bloom = easeOutCubic(seg(t, 0, 0.65));
  const drift = idle * 0.12 * Math.exp(-idle * 0.45);

  radialGlow(ctx, cx, cy, 86, tokens.accent, 0.18 * bloom);
  // Stained-glass cathedral dome starburst ribs
  const rays = 12;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * TAU + drift;
    drawRule(
      ctx,
      cx,
      cy,
      cx + Math.cos(a) * 140 * bloom,
      cy + Math.sin(a) * 90 * bloom,
      i % 2 === 0 ? tokens.accent2 : tokens.line,
      i % 2 === 0 ? 0.3 * bloom : 0.22 * bloom,
    );
  }
  // Crown arch of sequential chasing marquee bulbs
  const bulbs = 13;
  for (let i = 0; i < bulbs; i++) {
    const frac = i / (bulbs - 1);
    const angle = Math.PI + frac * Math.PI;
    const bx = cx + Math.cos(angle) * (w * 0.42);
    const by = h - 18 + Math.sin(angle) * (h * 0.72);
    const lit = Math.sin((t * 3 - frac) * Math.PI * 1.6) * 0.4 + 0.6;
    drawDot(ctx, bx, by, 2.5, tokens.accent, 0.35 + 0.6 * lit * bloom);
  }
  // Staggered stage glints
  drawSpark(
    ctx,
    cx - 56,
    cy - 26,
    7 * easeOutBack(seg(t, 0.3, 0.75)),
    tokens.accent,
    0.85,
  );
  drawSpark(
    ctx,
    cx + 60,
    cy - 18,
    6 * easeOutBack(seg(t, 0.45, 0.88)),
    tokens.accent2,
    0.85,
  );
  drawSpark(
    ctx,
    cx + 42,
    cy + 32,
    5 * easeOutBack(seg(t, 0.55, 0.95)),
    tokens.accent,
    0.75,
  );
}

function drawNewsdesk(ctx: CanvasRenderingContext2D, frame: SceneFrame): void {
  const { w, h, cx, cy, t, tokens } = frame;
  const intro = easeOutCubic(seg(t, 0, 0.45));
  const wave = seg(t, 0.25, 1);

  // 12-tick broadcast clock arc framing the upper stage
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU - Math.PI / 2;
    const r1 = 54;
    const r2 = i % 3 === 0 ? 61 : 58;
    drawRule(
      ctx,
      cx + Math.cos(a) * r1,
      cy + Math.sin(a) * r1,
      cx + Math.cos(a) * r2,
      cy + Math.sin(a) * r2,
      i === 0 ? tokens.accent : tokens.line,
      i === 0 ? 0.95 : 0.6 * intro,
      i % 3 === 0 ? 1.6 : 1,
    );
  }
  // Concentric broadcast transmission arcs radiating left & right
  for (let ring = 0; ring < 3; ring++) {
    const p = (wave + ring * 0.3) % 1;
    const rad = lerp(22, 74, easeOutCubic(p));
    const fade = (1 - p) * 0.75;
    drawRing(
      ctx,
      cx,
      cy - 12,
      rad,
      ring === 1 ? tokens.accent2 : tokens.accent,
      fade,
      1.4,
      -0.55,
      0.55,
    );
    drawRing(
      ctx,
      cx,
      cy - 12,
      rad,
      ring === 1 ? tokens.accent2 : tokens.accent,
      fade,
      1.4,
      Math.PI - 0.55,
      Math.PI + 0.55,
    );
  }
  // Crisp lower-third ticker rule
  const barW = lerp(0, w - 56, easeOutCubic(seg(t, 0.3, 0.85)));
  drawRule(ctx, 28, h - 18, 28 + barW, h - 18, tokens.accent, 0.65, 2);
  drawDot(ctx, cx, cy - 61, 3, tokens.accent, easeOutBack(seg(t, 0.35, 0.65)));
}

function drawBreakingdesk(
  ctx: CanvasRenderingContext2D,
  frame: SceneFrame,
): void {
  const { w, h, cx, cy, t, tokens } = frame;
  const sweep = easeOutCubic(seg(t, 0, 0.75));
  const pulse = 0.55 + 0.45 * Math.sin(t * Math.PI * 3);

  // Subtle broadcast news-globe meridians
  drawRing(ctx, cx, cy, 56, tokens.line, 0.45 * sweep);
  withAlpha(ctx, 0.35 * sweep, () => {
    ctx.strokeStyle = tokens.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 28, 56, 0, 0, TAU);
    ctx.ellipse(cx, cy, 56, 22, 0, 0, TAU);
    ctx.stroke();
  });
  // Uplink beam dashes from upper-left to lower-right
  withAlpha(ctx, 0.75 * sweep, () => {
    ctx.strokeStyle = tokens.accent;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(42, 24);
    ctx.lineTo(lerp(42, w - 42, sweep), lerp(24, h - 24, sweep));
    ctx.stroke();
    ctx.setLineDash([]);
  });
  // Calm bulletin beacon dot + tidy lower rule
  drawDot(ctx, 34, h - 20, 3.5, tokens.tint, pulse);
  radialGlow(ctx, 34, h - 20, 12, tokens.tint, 0.35 * pulse);
  drawRule(
    ctx,
    46,
    h - 20,
    lerp(46, w - 30, sweep),
    h - 20,
    tokens.line,
    0.7,
    1.5,
  );
}

function drawBroadsheet(
  ctx: CanvasRenderingContext2D,
  frame: SceneFrame,
): void {
  const { w, h, cx, cy, t, tokens } = frame;
  const ruleIn = easeOutCubic(seg(t, 0, 0.6));
  const regIn = easeOutBack(seg(t, 0.45, 0.9));

  // Double masthead rule + 4 vertical broadsheet column rules
  drawRule(ctx, 24, 24, lerp(24, w - 24, ruleIn), 24, tokens.ink, 0.35, 1.5);
  drawRule(ctx, 24, 28, lerp(24, w - 24, ruleIn), 28, tokens.line, 0.65, 1);
  for (let c = 1; c <= 3; c++) {
    const x = 24 + ((w - 48) / 4) * c;
    drawRule(ctx, x, 34, x, lerp(34, h - 22, ruleIn), tokens.line, 0.42);
  }
  radialGlow(ctx, cx, cy + 4, 62, tokens.accent, 0.12 * ruleIn);
  // Corner print registration crosshairs
  const marks: readonly [number, number][] = [
    [34, h - 22],
    [w - 34, 38],
  ];
  for (const [mx, my] of marks) {
    const s = 5.5 * regIn;
    drawRule(ctx, mx - s, my, mx + s, my, tokens.accent, 0.8, 1.1);
    drawRule(ctx, mx, my - s, mx, my + s, tokens.accent, 0.8, 1.1);
    drawRing(ctx, mx, my, s * 0.65, tokens.accent, 0.65, 1);
  }
}

function drawTelegraph(ctx: CanvasRenderingContext2D, frame: SceneFrame): void {
  const { w, h, cx, cy, t, tokens } = frame;
  const wire = easeOutCubic(seg(t, 0, 0.35));

  drawRule(ctx, 18, cy, w - 18, cy, tokens.line, 0.7 * wire, 1.2);
  // Travelling Morse dot-dash packets along the wire
  const pattern: readonly number[] = [4, 12, 4, 12, 4, 4, 12];
  let cursor = lerp(-40, w - 24, easeOutCubic(seg(t, 0.12, 0.92)));
  for (let i = 0; i < pattern.length; i++) {
    const len = pattern[i] ?? 4;
    if (cursor > 20 && cursor < w - 24) {
      drawRule(
        ctx,
        cursor,
        cy,
        cursor + len,
        cy,
        i % 2 === 0 ? tokens.accent : tokens.accent2,
        0.9,
        2.5,
      );
    }
    cursor -= len + 10;
  }
  // Spark-gap signal ripples + justified paragraph bars below
  for (let r = 0; r < 2; r++) {
    const rp = (seg(t, 0.2, 1) + r * 0.45) % 1;
    drawRing(
      ctx,
      cx,
      cy,
      lerp(18, 56, easeOutCubic(rp)),
      tokens.accent,
      (1 - rp) * 0.55,
      1.2,
    );
  }
  for (let row = 0; row < 3; row++) {
    const rw =
      (row === 2 ? 78 : 118) *
      easeOutCubic(seg(t, 0.45 + row * 0.1, 0.9 + row * 0.05));
    drawRule(
      ctx,
      cx - 59,
      h - 30 + row * 7,
      cx - 59 + rw,
      h - 30 + row * 7,
      tokens.muted,
      0.4,
      1.6,
    );
  }
}

export const PRESS_BROADCAST_SCENES = {
  viridian: {
    stillT: 0.92,
    draw: drawViridian,
    hero: {
      keyframes: [
        { opacity: 0.2, transform: "rotate(-90deg) scale(0.84)" },
        { opacity: 1, transform: "rotate(0deg) scale(1)" },
      ],
      options: {
        duration: 1350,
        easing: "cubic-bezier(0.2, 0, 0, 1)",
        fill: "both",
      },
    },
  },
  marquee: {
    stillT: 0.9,
    draw: drawMarquee,
    hero: {
      keyframes: [
        { opacity: 0.2, transform: "scale(0.76) rotate(-32deg)" },
        { opacity: 1, transform: "scale(1.09) rotate(6deg)", offset: 0.64 },
        { opacity: 1, transform: "scale(1) rotate(0deg)" },
      ],
      options: {
        duration: 1450,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "both",
      },
    },
  },
  newsdesk: {
    stillT: 0.85,
    draw: drawNewsdesk,
    hero: {
      keyframes: [
        { opacity: 0.2, transform: "translateY(10px) scale(0.9)" },
        { opacity: 1, transform: "translateY(-2px) scale(1.04)", offset: 0.6 },
        { opacity: 1, transform: "translateY(0) scale(1)" },
      ],
      options: {
        duration: 1250,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "both",
      },
    },
  },
  breakingdesk: {
    stillT: 0.9,
    draw: drawBreakingdesk,
    hero: {
      keyframes: [
        { opacity: 0.2, transform: "rotate(-12deg) scale(0.86)" },
        { opacity: 1, transform: "rotate(2deg) scale(1.04)", offset: 0.65 },
        { opacity: 1, transform: "rotate(0deg) scale(1)" },
      ],
      options: {
        duration: 1350,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "both",
      },
    },
  },
  broadsheet: {
    stillT: 0.92,
    draw: drawBroadsheet,
    hero: {
      keyframes: [
        { opacity: 0.2, transform: "scaleX(0.8) scaleY(0.92) rotate(-3deg)" },
        {
          opacity: 1,
          transform: "scaleX(1.03) scaleY(1.01) rotate(0.5deg)",
          offset: 0.68,
        },
        { opacity: 1, transform: "scale(1) rotate(0deg)" },
      ],
      options: {
        duration: 1350,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "both",
      },
    },
  },
  telegraph: {
    stillT: 0.88,
    draw: drawTelegraph,
    hero: {
      keyframes: [
        { opacity: 0.25, transform: "translateY(0) scale(0.9)" },
        { opacity: 1, transform: "translateY(2px) scale(1.04)", offset: 0.28 },
        { opacity: 1, transform: "translateY(-1px) scale(0.99)", offset: 0.46 },
        { opacity: 1, transform: "translateY(2px) scale(1.03)", offset: 0.64 },
        { opacity: 1, transform: "translateY(0) scale(1)" },
      ],
      options: { duration: 1400, easing: "ease-out", fill: "both" },
    },
  },
} as const satisfies Record<string, GemSceneSpec>;
