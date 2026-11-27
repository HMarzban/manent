// HiDPI Canvas 2D + Web Animations API interactive collector vitrine stage with 3D tilt, parallax, hold-to-charge and 24 click bursts.
import type { StudioPaletteId } from "@manent/settings";
import { RotateCcwIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent, PointerEvent, ReactNode } from "react";
import { APPEARANCE_STUDIO_WORDS } from "../../words/appearance.ts";
import { playGemFoley } from "./gem-audio.ts";
import { GEM_SCENES } from "./gem-scene-registry.ts";
import { BURST_DURATION_MS } from "./gem-stage-bursts.ts";
import {
  CHARGE_HOLD_MS,
  FLOURISH_MS,
  SETTLE_TOTAL_MS,
  STAGE_H,
  STAGE_W,
  paintStageCanvas,
  prefersReducedMotion,
  readStageTokens,
} from "./gem-stage-paint.ts";
import { clamp01 } from "./gem-stage-primitives.ts";
import type { StageBurst } from "./gem-stage-types.ts";
import { HiddenGemIcon } from "./hidden-gems.tsx";

interface InteractiveState {
  targetPx: number;
  targetPy: number;
  px: number;
  py: number;
  pointerInside: boolean;
  chargeStart: number | null;
  charge: number;
  bursts: StageBurst[];
  wake: (() => void) | null;
}

/**
 * Interactive collector vitrine stage pairing a 3-plane Canvas 2D vignette with
 * a Web Animations API hero `<HiddenGemIcon>`, 3D foil tilt, hold-to-charge, and
 * 24 bespoke click-burst reactions.
 */
export function GemStage(props: {
  readonly palette: StudioPaletteId;
  readonly runKey: number;
  readonly soundEnabled: boolean;
  readonly onReplay: () => void;
}): ReactNode {
  const { palette, runKey, soundEnabled, onReplay } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const probeRef = useRef<HTMLSpanElement | null>(null);
  const heroRef = useRef<HTMLSpanElement | null>(null);
  const tiltRef = useRef<HTMLSpanElement | null>(null);
  const [burstCount, setBurstCount] = useState(0);

  const stateRef = useRef<InteractiveState>({
    targetPx: 0,
    targetPy: 0,
    px: 0,
    py: 0,
    pointerInside: false,
    chargeStart: null,
    charge: 0,
    bursts: [],
    wake: null,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const scene = GEM_SCENES[palette];
    const reduced = prefersReducedMotion();
    const state = stateRef.current;
    state.bursts = [];
    state.chargeStart = null;
    state.charge = 0;

    let tokens = readStageTokens(probeRef.current);
    let rafId: number | null = null;
    let heroAnim: Animation | null = null;
    let startTime: number | null = null;

    const applyTilt = (px: number, py: number, charge: number): void => {
      const tiltEl = tiltRef.current;
      if (tiltEl === null) return;
      if (
        reduced ||
        (Math.abs(px) < 0.004 && Math.abs(py) < 0.004 && charge < 0.004)
      ) {
        tiltEl.style.transform = "";
        return;
      }
      const rx = (-py * 12).toFixed(2);
      const ry = (px * 12).toFixed(2);
      const scale = (1 - charge * 0.09).toFixed(3);
      tiltEl.style.transform = `perspective(420px) rotateX(${rx}deg) rotateY(${ry}deg) scale(${scale})`;
    };

    const drawStatic = (): void => {
      applyTilt(0, 0, 0);
      paintStageCanvas(
        canvas,
        palette,
        scene,
        tokens,
        reduced ? scene.stillT : 1,
        reduced ? 0 : (SETTLE_TOTAL_MS - FLOURISH_MS) / 1000,
        reduced,
        0,
        0,
        0,
        [],
        0,
      );
    };

    const tick = (now: number): void => {
      if (typeof document !== "undefined" && document.hidden) {
        rafId = null;
        return;
      }
      if (startTime === null) startTime = now;
      const elapsed = Math.max(0, now - startTime);
      const t = Math.min(1, elapsed / FLOURISH_MS);
      const idle = elapsed > FLOURISH_MS ? (elapsed - FLOURISH_MS) / 1000 : 0;

      state.px += (state.targetPx - state.px) * 0.16;
      state.py += (state.targetPy - state.py) * 0.16;
      if (state.chargeStart !== null) {
        state.charge = clamp01((now - state.chargeStart) / CHARGE_HOLD_MS);
      } else {
        state.charge *= 0.8;
        if (state.charge < 0.01) state.charge = 0;
      }
      if (state.bursts.length > 0) {
        state.bursts = state.bursts.filter(
          (b) => now - b.startMs < BURST_DURATION_MS,
        );
      }

      applyTilt(state.px, state.py, state.charge);
      paintStageCanvas(
        canvas,
        palette,
        scene,
        tokens,
        t,
        idle,
        false,
        state.px,
        state.py,
        state.charge,
        state.bursts,
        now,
      );

      const settlingPointer =
        state.pointerInside ||
        Math.abs(state.px - state.targetPx) > 0.008 ||
        Math.abs(state.py - state.targetPy) > 0.008;
      const keepGoing =
        elapsed < SETTLE_TOTAL_MS ||
        settlingPointer ||
        state.charge > 0.01 ||
        state.bursts.length > 0;

      if (keepGoing) {
        rafId = window.requestAnimationFrame(tick);
      } else {
        state.px = 0;
        state.py = 0;
        applyTilt(0, 0, 0);
        rafId = null;
      }
    };

    const wake = (): void => {
      if (reduced || rafId !== null) return;
      if (
        typeof window !== "undefined" &&
        typeof window.requestAnimationFrame === "function"
      ) {
        rafId = window.requestAnimationFrame(tick);
      }
    };
    state.wake = wake;

    const refreshTokens = (): void => {
      tokens = readStageTokens(probeRef.current);
      if (rafId === null) drawStatic();
    };

    let rootObserver: MutationObserver | null = null;
    if (
      typeof document !== "undefined" &&
      typeof MutationObserver !== "undefined"
    ) {
      rootObserver = new MutationObserver(refreshTokens);
      rootObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme", "data-palette"],
      });
    }

    const schemeMedia =
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;
    const onSchemeChange = (): void => refreshTokens();
    schemeMedia?.addEventListener?.("change", onSchemeChange);

    if (reduced) {
      drawStatic();
    } else {
      const heroEl = heroRef.current;
      if (heroEl !== null && typeof heroEl.animate === "function") {
        heroAnim = heroEl.animate(
          [...scene.hero.keyframes],
          scene.hero.options,
        );
        heroAnim.finished?.catch(() => {});
      }
      if (
        typeof window !== "undefined" &&
        typeof window.requestAnimationFrame === "function"
      ) {
        rafId = window.requestAnimationFrame(tick);
      } else {
        drawStatic();
      }
    }

    return () => {
      state.wake = null;
      if (rafId !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(rafId);
      }
      heroAnim?.cancel();
      applyTilt(0, 0, 0);
      rootObserver?.disconnect();
      schemeMedia?.removeEventListener?.("change", onSchemeChange);
    };
  }, [palette, runKey]);

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLButtonElement>): void => {
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const state = stateRef.current;
      state.pointerInside = true;
      state.targetPx =
        clamp01((event.clientX - rect.left) / rect.width) * 2 - 1;
      state.targetPy =
        clamp01((event.clientY - rect.top) / rect.height) * 2 - 1;
      state.wake?.();
    },
    [],
  );

  const onPointerLeave = useCallback((): void => {
    const state = stateRef.current;
    state.pointerInside = false;
    state.targetPx = 0;
    state.targetPy = 0;
    state.chargeStart = null;
    state.wake?.();
  }, []);

  const onPointerDown = useCallback((): void => {
    const state = stateRef.current;
    state.chargeStart =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    state.wake?.();
  }, []);

  const onStageClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>): void => {
      const state = stateRef.current;
      const wasCharged = state.charge >= 0.7;
      state.chargeStart = null;

      if (event.detail === 0 || wasCharged) {
        onReplay();
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      const x =
        rect.width > 0
          ? ((event.clientX - rect.left) / rect.width) * STAGE_W
          : STAGE_W / 2;
      const y =
        rect.height > 0
          ? ((event.clientY - rect.top) / rect.height) * STAGE_H
          : STAGE_H / 2;
      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const roll =
        palette === "chiaroscuro"
          ? 1 + Math.floor(Math.random() * 20)
          : undefined;

      state.bursts = [
        ...state.bursts.slice(-4),
        {
          x: Number.isFinite(x) ? x : STAGE_W / 2,
          y: Number.isFinite(y) ? y : STAGE_H / 2,
          startMs: now,
          seed: (now % 97) + 1,
          roll,
        },
      ];
      setBurstCount((prev) => prev + 1);
      playGemFoley(palette, {
        enabled: soundEnabled,
        kind: roll === 20 ? "crit" : "burst",
      });

      const heroEl = heroRef.current;
      if (
        !prefersReducedMotion() &&
        heroEl !== null &&
        typeof heroEl.animate === "function"
      ) {
        const pulse = heroEl.animate(
          [
            { transform: "scale(1)" },
            { transform: "scale(1.09)", offset: 0.35 },
            { transform: "scale(1)" },
          ],
          { duration: 340, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
        );
        pulse.finished?.catch(() => {});
      }
      state.wake?.();
    },
    [onReplay, palette, soundEnabled],
  );

  return (
    <button
      type="button"
      onClick={onStageClick}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
      aria-label={APPEARANCE_STUDIO_WORDS.gemReplay}
      data-gem-stage={palette}
      data-gem-run={String(runKey)}
      data-gem-bursts={String(burstCount)}
      className="mn-gem-stage group/gem-stage"
    >
      <span ref={probeRef} aria-hidden="true" className="mn-gem-stage-probe" />
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        width={STAGE_W}
        height={STAGE_H}
        className="mn-gem-canvas"
      />
      <span ref={tiltRef} aria-hidden="true" className="mn-gem-hero-tilt">
        <span ref={heroRef} className="mn-gem-hero">
          <HiddenGemIcon palette={palette} className="size-10" />
        </span>
      </span>
      <span aria-hidden="true" className="mn-gem-replay-hint">
        <RotateCcwIcon className="size-3" />
      </span>
    </button>
  );
}
