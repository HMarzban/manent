// Bespoke interactive Canvas 2D click-burst reactions: Books, Stage, Podcast & Games (13 palettes).
import {
  TAU,
  clamp01,
  drawDot,
  drawRing,
  drawRule,
  drawSpark,
  easeOutCubic,
  lerp,
  radialGlow,
  seeded,
  withAlpha,
} from "../gem-stage-primitives.ts";
import type { BurstPainter } from "./bursts-screen.ts";

export const CRAFT_BURSTS: Readonly<Record<string, BurstPainter>> =
  Object.freeze({
    sylvan(ctx, { x, y, seed }, p, tokens) {
      const e = easeOutCubic(p);
      const fade = clamp01(1 - p);
      for (let i = 0; i < 7; i++) {
        const dx = (seeded(i, seed) - 0.5) * 44 * e + Math.sin(p * 7 + i) * 3;
        const dy = -lerp(2, 34 + seeded(i, seed + 2) * 16, e);
        drawDot(ctx, x + dx, y + dy, 2.1 * fade, tokens.accent2, 0.9 * fade);
        radialGlow(ctx, x + dx, y + dy, 8 * fade, tokens.accent2, 0.35 * fade);
      }
    },
    clothbound(ctx, { x, y }, p, tokens) {
      const e = easeOutCubic(p);
      const fade = clamp01(1 - p);
      const span = lerp(6, 32, e);
      withAlpha(ctx, 0.78 * fade, () => {
        ctx.strokeStyle = tokens.accent2;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x, y + 6);
        ctx.quadraticCurveTo(x - span * 0.6, y - span * 0.7, x - span, y);
        ctx.moveTo(x, y + 6);
        ctx.quadraticCurveTo(x + span * 0.6, y - span * 0.7, x + span, y);
        ctx.stroke();
      });
    },
    ambercourt(ctx, { x, y }, p, tokens) {
      const e = easeOutCubic(p);
      const fade = clamp01(1 - p);
      drawRing(
        ctx,
        x,
        y,
        lerp(6, 30, e),
        tokens.accent,
        0.7 * fade,
        1.4,
        0,
        TAU * e,
      );
      drawRing(
        ctx,
        x,
        y,
        lerp(10, 42, e),
        tokens.accent2,
        0.55 * fade,
        1.2,
        Math.PI,
        Math.PI + TAU * e,
      );
      drawSpark(ctx, x, y, 10 * fade, tokens.accent2, 0.85 * fade);
    },
    seaandink(ctx, { x, y }, p, tokens) {
      const e = easeOutCubic(p);
      const fade = clamp01(1 - p);
      drawRing(ctx, x, y, lerp(5, 36, e), tokens.accent, 0.68 * fade, 1.3);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        const r = lerp(4, i % 2 === 0 ? 24 : 14, e);
        drawRule(
          ctx,
          x,
          y,
          x + Math.cos(a) * r,
          y + Math.sin(a) * r,
          tokens.accent2,
          0.7 * fade,
          1.2,
        );
      }
    },
    copperplate(ctx, { x, y }, p, tokens) {
      const e = easeOutCubic(p);
      const fade = clamp01(1 - p);
      withAlpha(ctx, 0.85 * fade, () => {
        ctx.strokeStyle = tokens.accent;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        const steps = 18;
        for (let i = 0; i <= steps; i++) {
          const f = i / steps;
          const fx = x + (f - 0.5) * 54 * e;
          const fy = y + Math.sin(f * TAU) * 8 * e;
          if (i === 0) ctx.moveTo(fx, fy);
          else ctx.lineTo(fx, fy);
        }
        ctx.stroke();
      });
      drawSpark(ctx, x + 27 * e, y, 5 * fade, tokens.accent2, 0.85 * fade);
    },
    proscenium(ctx, { x, y, seed }, p, tokens) {
      const e = easeOutCubic(p);
      const fade = clamp01(1 - p);
      radialGlow(ctx, x, y, lerp(14, 56, e), tokens.accent2, 0.48 * fade);
      for (let i = 0; i < 6; i++) {
        const dx = (seeded(i, seed + 7) - 0.5) * 34 * e;
        const dy = -lerp(2, 26, e) * (0.5 + seeded(i, 9) * 0.5);
        drawDot(ctx, x + dx, y + dy, 1.7, tokens.accent2, 0.8 * fade);
      }
    },
    globetimber(ctx, { x, y }, p, tokens) {
      const e = easeOutCubic(p);
      const fade = clamp01(1 - p);
      withAlpha(ctx, 0.32 * fade, () => {
        ctx.fillStyle = tokens.accent2;
        ctx.beginPath();
        ctx.moveTo(x - 10, y - 34);
        ctx.lineTo(x + 6, y - 34);
        ctx.lineTo(x + 26 * e + 8, y + 34);
        ctx.lineTo(x + 26 * e - 8, y + 34);
        ctx.closePath();
        ctx.fill();
      });
      drawSpark(ctx, x, y, 9 * fade, tokens.accent, 0.75 * fade);
    },
    velvetbox(ctx, { x, y }, p, tokens) {
      const e = easeOutCubic(p);
      const fade = clamp01(1 - p);
      const amp = Math.sin(p * TAU * 4) * fade * 9;
      withAlpha(ctx, 0.85 * fade, () => {
        ctx.strokeStyle = tokens.accent2;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x, y - 34);
        ctx.quadraticCurveTo(x + amp, y, x, y + 34);
        ctx.stroke();
      });
      drawRing(ctx, x, y, lerp(6, 36, e), tokens.accent, 0.6 * fade, 1.2);
    },
    soundbooth(ctx, { x, y }, p, tokens) {
      const fade = clamp01(1 - p);
      for (let i = -2; i <= 2; i++) {
        const h =
          (18 - Math.abs(i) * 4) *
          (1 - p * 0.5) *
          Math.abs(Math.sin(p * 10 + i));
        drawRule(
          ctx,
          x + i * 6,
          y - h,
          x + i * 6,
          y + h,
          i === 0 ? tokens.accent2 : tokens.accent,
          0.85 * fade,
          2.4,
        );
      }
    },
    reeltoreel(ctx, { x, y }, p, tokens) {
      const e = easeOutCubic(p);
      const fade = clamp01(1 - p);
      const r = lerp(8, 28, e);
      const spin = p * TAU * 1.2;
      drawRing(
        ctx,
        x,
        y,
        r,
        tokens.accent2,
        0.75 * fade,
        1.5,
        spin,
        spin + Math.PI * 0.8,
      );
      drawRing(
        ctx,
        x,
        y,
        r,
        tokens.accent,
        0.75 * fade,
        1.5,
        spin + Math.PI,
        spin + Math.PI * 1.8,
      );
    },
    nightfreq(ctx, { x, y }, p, tokens) {
      const e = easeOutCubic(p);
      const fade = clamp01(1 - p);
      const fadeFast = clamp01(1 - p * 1.35);
      drawRing(ctx, x, y, lerp(4, 38, e), tokens.accent, 0.85 * fade, 1.5);
      drawDot(ctx, x, y, 3.5 * fadeFast, tokens.accent2, 0.95 * fadeFast);
      radialGlow(ctx, x, y, 22 * fade, tokens.accent, 0.42 * fade);
    },
    chiaroscuro(ctx, { x, y, roll }, p, tokens) {
      const e = easeOutCubic(p);
      const fade = clamp01(1 - p);
      const value = roll ?? 20;
      const isCrit = value === 20;
      const r = lerp(8, isCrit ? 42 : 28, e);
      if (isCrit) {
        radialGlow(ctx, x, y, 58 * e, tokens.accent2, 0.5 * fade);
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU + p * 0.4;
          drawSpark(
            ctx,
            x + Math.cos(a) * r,
            y + Math.sin(a) * r,
            7 * fade,
            i % 2 === 0 ? tokens.accent2 : tokens.accent,
            0.9 * fade,
          );
        }
      }
      drawRing(
        ctx,
        x,
        y,
        r * 0.75,
        tokens.accent2,
        0.78 * fade,
        isCrit ? 1.8 : 1.3,
      );
      withAlpha(ctx, clamp01(1.15 - p), () => {
        ctx.fillStyle = tokens.surface;
        ctx.strokeStyle = isCrit ? tokens.accent2 : tokens.accent;
        ctx.lineWidth = isCrit ? 1.8 : 1.3;
        ctx.beginPath();
        ctx.arc(x, y - 10 * e, isCrit ? 13 : 11, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = isCrit ? tokens.accent2 : tokens.ink;
        ctx.font = `700 ${isCrit ? 11 : 10}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(value), x, y - 10 * e + 0.5);
      });
    },
    nocturne(ctx, { x, y }, p, tokens) {
      const e = easeOutCubic(p);
      const fade = clamp01(1 - p);
      const dx = lerp(-24, 34, e);
      const dy = lerp(-12, 16, e);
      drawRule(
        ctx,
        x + dx - 18 * fade,
        y + dy - 8.5 * fade,
        x + dx,
        y + dy,
        tokens.accent,
        0.85 * fade,
        1.8,
      );
      drawSpark(ctx, x + dx, y + dy, 7 * fade, tokens.accent2, 0.95 * fade);
      radialGlow(ctx, x + dx, y + dy, 16 * fade, tokens.accent, 0.4 * fade);
    },
  });
