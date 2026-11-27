// Reactive active-palette Hidden Gem emblem synced to html[data-palette] for main app status bars and studio surfaces.
import { STUDIO_PALETTE_IDS } from "@manent/settings";
import type { StudioPaletteId } from "@manent/settings";
import { cn } from "cn";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { HiddenGemIcon } from "./hidden-gems.tsx";
import { PaletteGemPopover } from "./palette-gem-popover.tsx";

const VALID_PALETTES: ReadonlySet<string> = new Set(STUDIO_PALETTE_IDS);

function readPaletteFromRoot(): StudioPaletteId {
  if (typeof document === "undefined") return "studio";
  const raw = document.documentElement.getAttribute("data-palette");
  return raw !== null && VALID_PALETTES.has(raw)
    ? (raw as StudioPaletteId)
    : "studio";
}

const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;

function subscribePalette(listener: () => void): () => void {
  listeners.add(listener);
  if (
    observer === null &&
    typeof document !== "undefined" &&
    typeof MutationObserver !== "undefined"
  ) {
    observer = new MutationObserver(() => {
      for (const notify of listeners) notify();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-palette"],
    });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && observer !== null) {
      observer.disconnect();
      observer = null;
    }
  };
}

/** Current studio palette applied on `document.documentElement` (`data-palette`), defaulting to `"studio"`. */
export function useActiveStudioPalette(): StudioPaletteId {
  return useSyncExternalStore(
    subscribePalette,
    readPaletteFromRoot,
    () => "studio",
  );
}

/**
 * Collector Hidden Gem emblem for the active studio palette.
 * Keeps status bars and the opening desk quiet (`aria-hidden="true"`, zero extra tab stops);
 * clicking opens the Collector Vitrine popover with that theme's bespoke kinetic animation.
 * Gives a single subtle shimmer nod when switching themes, and hides cleanly when
 * `appearance.hiddenGems` is off, in forced colours or in print.
 */
export function ActivePaletteGem(props: {
  readonly className?: string;
  readonly iconClassName?: string;
  readonly onOpenAppearance?: () => void;
  readonly onSelectPalette?: (palette: StudioPaletteId) => void;
  readonly keptPalettes?: readonly StudioPaletteId[];
  readonly onVisitPalette?: (palette: StudioPaletteId) => void;
  readonly soundEnabled?: boolean;
  readonly onToggleSound?: () => void;
}): ReactNode {
  const palette = useActiveStudioPalette();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const previousPaletteRef = useRef<StudioPaletteId>(palette);

  // Subtle one-shot discovery shimmer when switching themes (never on initial mount or reduced motion).
  useEffect(() => {
    if (previousPaletteRef.current === palette) return;
    previousPaletteRef.current = palette;
    const el = anchorRef.current;
    if (el === null || typeof el.animate !== "function") return;
    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const nod = el.animate(
      [
        { opacity: 0.76, transform: "scale(1)" },
        { opacity: 1, transform: "scale(1.24)", offset: 0.42 },
        { opacity: 0.76, transform: "scale(1)" },
      ],
      { duration: 860, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
    nod.finished?.catch(() => {});
    return () => nod.cancel();
  }, [palette]);

  return (
    <>
      <span
        ref={anchorRef}
        aria-hidden="true"
        data-palette-gem={palette}
        data-open={open ? "" : undefined}
        onClick={() => setOpen((prev) => !prev)}
        className={cn("mn-gem-only mn-app-gem", props.className)}
      >
        <HiddenGemIcon
          palette={palette}
          className={props.iconClassName ?? "size-icon"}
        />
      </span>
      <PaletteGemPopover
        palette={palette}
        open={open}
        onOpenChange={setOpen}
        anchorRef={anchorRef}
        onOpenAppearance={props.onOpenAppearance}
        onSelectPalette={props.onSelectPalette}
        keptPalettes={props.keptPalettes}
        onVisitPalette={props.onVisitPalette}
        soundEnabled={props.soundEnabled}
        onToggleSound={props.onToggleSound}
      />
    </>
  );
}
