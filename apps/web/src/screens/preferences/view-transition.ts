// Concurrency-safe Two-Tier View Transition helper for Preferences -> Appearance (ADR 0078).
// Permitted by tools/check-ui-rules.ts solely in this module; strictly gated on !prefers-reduced-motion.

export type AppearanceTransitionKind = "iris" | "crossfade";

export interface AppearanceTransitionOptions {
  readonly originEl?: HTMLElement | null;
  readonly kind: AppearanceTransitionKind;
  readonly mutate: () => void;
}

interface ViewTransitionLike {
  readonly ready: Promise<void>;
  readonly updateCallbackDone: Promise<void>;
  readonly finished: Promise<void>;
  skipTransition(): void;
}

type TransitionDoc = Document & {
  startViewTransition?: (callback: () => void) => ViewTransitionLike;
};

let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let activeTransition: ViewTransitionLike | null = null;

function clearMorphing(doc: Document): void {
  for (const el of doc.querySelectorAll('[data-morphing="true"]'))
    el.removeAttribute("data-morphing");
}

function skipMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return false;
  return (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    window.matchMedia("(forced-colors: active)").matches
  );
}

/**
 * Runs `mutate` inside a two-tier View Transition when motion is allowed:
 * - "iris": 420 ms expanding radial wave from the clicked squircle's centre
 * - "crossfade": calm 220 ms tonal dissolve when auditioning the 24 studio palettes
 */
export function runAppearanceTransition(
  options: AppearanceTransitionOptions,
): void {
  const { originEl = null, kind, mutate } = options;
  const doc = document as TransitionDoc;

  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  clearMorphing(doc);
  if (activeTransition !== null) {
    try {
      activeTransition.skipTransition();
    } catch {
      // transition already settled
    }
    activeTransition = null;
  }

  if (skipMotion() || typeof doc.startViewTransition !== "function") {
    mutate();
    return;
  }

  const isSquircle =
    kind === "iris" &&
    originEl !== null &&
    originEl.classList.contains("mn-scheme-squircle");
  const delay = isSquircle ? 65 : 0;
  if (isSquircle) originEl.setAttribute("data-morphing", "true");

  const start = (): void => {
    pendingTimer = null;
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    if (originEl !== null && originEl.isConnected) {
      const rect = originEl.getBoundingClientRect();
      x = Math.max(0, Math.min(window.innerWidth, rect.left + rect.width / 2));
      y = Math.max(0, Math.min(window.innerHeight, rect.top + rect.height / 2));
    }
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );
    const root = doc.documentElement;
    const vt = doc.startViewTransition!(() => {
      root.setAttribute("data-switching", "");
      clearMorphing(doc);
      mutate();
    });
    activeTransition = vt;
    const clearSwitching = (): void => {
      if (activeTransition === vt) root.removeAttribute("data-switching");
    };
    void vt.updateCallbackDone.then(clearSwitching, clearSwitching);
    void vt.ready
      .then(() => {
        if (typeof root.animate !== "function") return;
        if (kind === "iris") {
          root.animate(
            {
              clipPath: [
                `circle(0px at ${x}px ${y}px)`,
                `circle(${endRadius}px at ${x}px ${y}px)`,
              ],
            },
            {
              duration: 420,
              easing: "cubic-bezier(0.22, 1, 0.36, 1)",
              fill: "both",
              pseudoElement: "::view-transition-new(root)",
            },
          );
        } else {
          root.animate(
            { opacity: [0, 1] },
            {
              duration: 220,
              easing: "cubic-bezier(0.16, 1, 0.3, 1)",
              fill: "both",
              pseudoElement: "::view-transition-new(root)",
            },
          );
        }
      })
      .catch(() => {
        // transition skipped or interrupted
      });
    void vt.finished.finally(() => {
      if (activeTransition === vt) activeTransition = null;
    });
  };

  if (delay > 0) pendingTimer = setTimeout(start, delay);
  else start();
}
