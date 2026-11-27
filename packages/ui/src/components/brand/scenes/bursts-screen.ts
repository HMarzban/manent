// Bespoke interactive Canvas 2D click-burst reactions: Cinema, Space, TV & Broadcast Press (11 palettes).
import {
  TAU,
  clamp01,
  drawDot,
  drawRing,
  drawRule,
  drawSpark,
  easeOutBack,
  easeOutCubic,
  lerp,
  radialGlow,
  seeded,
  withAlpha,
} from "../gem-stage-primitives.ts";
import type { StageBurst, StageTokens } from "../gem-stage-types.ts";

export type BurstPainter = (
  ctx: CanvasRenderingContext2D,
  burst: StageBurst,
  p: number,
  tokens: StageTokens,
) => void;

export const SCREEN_BURSTS: Readonly<Record<string, BurstPainter>> =
  Object.freeze({
    studio(ctx, { x, y, seed }, p, tokens) {
      const e = easeOutCubic(p);
      const fade = clamp01(1 - p);
      drawRing(ctx, x, y, lerp(4, 34, e), tokens.accent, 0.65 * fade, 1.5);
      drawSpark(
        ctx,
        x,
        y,
        12 * easeOutBack(Math.min(1, p * 2.2)) * fade,
        tokens.accent2,
        0.9 * fade,
      );
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + seed;
        const d = lerp(4, 28, e);
        drawDot(
          ctx,
          x + Math.cos(a) * d,
          y + Math.sin(a) * d,
          1.8 * fade,
          tokens.accent,
          0.85 * fade,
        );
      }
    },
    hyperdrive(ctx, { x, y }, p, tokens) {
      const e = easeOutCubic(p);
      const fade = clamp01(1 - p);
      const fadeFast = clamp01(1 - p * 1.35);
      const span = lerp(6, 46, e);
      radialGlow(ctx, x, y, 36 * e, tokens.accent, 0.45 * fade);
      drawRule(
        ctx,
        x - span,
        y - span * 0.65,
        x + span,
        y + span * 0.65,
        tokens.accent,
        0.95 * fade,
        2.2,
      );
      drawRule(
        ctx,
        x - span,
        y + span * 0.65,
        x + span,
        y - span * 0.65,
        tokens.accent2,
        0.85 * fade,
        1.8,
      );
      drawSpark(ctx, x, y, 16 * fadeFast, tokens.surface, 0.95 * fadeFast);
    },
    starfleet(ctx, { x, y }, p, tokens) {
      const e = easeOutCubic(p);
      const fade = clamp01(1 - p);
      const r = lerp(8, 34, e);
      drawRing(ctx, x, y, r, tokens.accent, 0.75 * fade, 1.5, -0.4, 0.9);
      drawRing(
        ctx,
        x,
        y,
        r,
        tokens.accent2,
        0.75 * fade,
        1.5,
        Math.PI - 0.4,
        Math.PI + 0.9,
      );
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU;
        drawRule(
          ctx,
          x + Math.cos(a) * (r - 4),
          y + Math.sin(a) * (r - 4),
          x + Math.cos(a) * (r + 5),
          y + Math.sin(a) * (r + 5),
          tokens.accent,
          0.8 * fade,
          1.4,
        );
      }
    },
    celluloid(ctx, { x, y, seed }, p, tokens) {
      const e = easeOutCubic(p);
      const fade = clamp01(1 - p);
      radialGlow(ctx, x, y, lerp(14, 52, e), tokens.accent2, 0.45 * fade);
      drawRing(ctx, x, y, lerp(6, 30, e), tokens.accent, 0.5 * fade, 1.2);
      for (let i = 0; i < 10; i++) {
        const a = seeded(i, seed) * TAU;
        const dist = lerp(3, 38 * (0.4 + seeded(i, seed + 5) * 0.6), e);
        drawDot(
          ctx,
          x + Math.cos(a) * dist,
          y + Math.sin(a) * dist,
          1.5 + seeded(i, 3),
          tokens.accent2,
          0.85 * fade,
        );
      }
    },
    nightwire(ctx, { x, y }, p, tokens) {
      const e = easeOutCubic(p);
      const fade = clamp01(1 - p);
      drawRing(ctx, x, y, lerp(4, 34, e), tokens.accent, 0.8 * fade, 1.4);
      drawRing(ctx, x, y, lerp(2, 22, e), tokens.accent2, 0.55 * fade, 1);
      drawRule(
        ctx,
        x,
        y - 6,
        x - 6 * e,
        y + 26 * e,
        tokens.accent,
        0.75 * fade,
        1.3,
      );
    },
    viridian(ctx, { x, y }, p, tokens) {
      const e = easeOutCubic(p);
      const fade = clamp01(1 - p);
      for (let k = 0; k < 2; k++) {
        const s = lerp(8 + k * 6, 38 + k * 14, e);
        withAlpha(ctx, (0.75 - k * 0.25) * fade, () => {
          ctx.strokeStyle = k === 0 ? tokens.accent : tokens.line;
          ctx.lineWidth = 1.3;
          ctx.strokeRect(x - s / 2, y - s / 2, s, s);
        });
      }
    },
    marquee(ctx, { x, y, seed }, p, tokens) {
      const e = easeOutCubic(p);
      const fade = clamp01(1 - p);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + seed * 0.7;
        const d = lerp(4, 36, e);
        drawSpark(
          ctx,
          x + Math.cos(a) * d,
          y + Math.sin(a) * d,
          6.5 * fade,
          i % 2 === 0 ? tokens.accent : tokens.accent2,
          0.9 * fade,
        );
      }
    },
    newsdesk(ctx, { x, y }, p, tokens) {
      const e = easeOutCubic(p);
      const fade = clamp01(1 - p);
      for (let k = 0; k < 2; k++) {
        const r = lerp(6 + k * 8, 36 + k * 12, e);
        const colour = k === 0 ? tokens.accent : tokens.accent2;
        drawRing(ctx, x, y, r, colour, 0.75 * fade, 1.5, -0.65, 0.65);
        drawRing(
          ctx,
          x,
          y,
          r,
          colour,
          0.75 * fade,
          1.5,
          Math.PI - 0.65,
          Math.PI + 0.65,
        );
      }
    },
    breakingdesk(ctx, { x, y }, p, tokens) {
      const e = easeOutCubic(p);
      const fade = clamp01(1 - p);
      const fadeFast = clamp01(1 - p * 1.35);
      const s = lerp(6, 28, e);
      drawRing(ctx, x, y, s, tokens.tint, 0.8 * fade, 1.6);
      drawRule(ctx, x - s - 4, y, x + s + 4, y, tokens.accent, 0.55 * fade, 1);
      drawRule(ctx, x, y - s - 4, x, y + s + 4, tokens.accent, 0.55 * fade, 1);
      drawDot(ctx, x, y, 3.2 * fadeFast, tokens.tint, 0.95 * fadeFast);
    },
    broadsheet(ctx, { x, y }, p, tokens) {
      const e = easeOutCubic(p);
      const fade = clamp01(1 - p);
      const s = lerp(6, 16, e);
      drawRing(ctx, x, y, s, tokens.accent, 0.7 * fade, 1.2);
      drawRule(
        ctx,
        x - s * 1.5,
        y,
        x + s * 1.5,
        y,
        tokens.accent,
        0.8 * fade,
        1.2,
      );
      drawRule(
        ctx,
        x,
        y - s * 1.5,
        x,
        y + s * 1.5,
        tokens.accent,
        0.8 * fade,
        1.2,
      );
    },
    telegraph(ctx, { x, y }, p, tokens) {
      const e = easeOutCubic(p);
      const fade = clamp01(1 - p);
      const segs = [4, 12, 4, 12];
      let offset = lerp(6, 32, e);
      for (const len of segs) {
        drawRule(
          ctx,
          x + offset,
          y,
          x + offset + len,
          y,
          tokens.accent,
          0.9 * fade,
          2.2,
        );
        drawRule(
          ctx,
          x - offset,
          y,
          x - offset - len,
          y,
          tokens.accent2,
          0.9 * fade,
          2.2,
        );
        offset += len + 5;
      }
    },
  });
