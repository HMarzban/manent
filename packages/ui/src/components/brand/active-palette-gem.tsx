// Reactive active-palette Hidden Gem emblem synced to html[data-palette] for main app status bars and studio surfaces.
import { STUDIO_PALETTE_IDS } from "@manent/settings";
import type { StudioPaletteId } from "@manent/settings";
import { cn } from "cn";
import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { HiddenGemIcon } from "./hidden-gems.tsx";

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
 * Purely decorative (`aria-hidden="true"`) collector Hidden Gem emblem for the active studio palette.
 * Hidden automatically when `appearance.hiddenGems` is off (`html[data-gems="off"] .mn-gem-only`),
 * in forced colours and in print.
 */
export function ActivePaletteGem(props: {
  readonly className?: string;
  readonly iconClassName?: string;
}): ReactNode {
  const palette = useActiveStudioPalette();
  return (
    <span
      aria-hidden="true"
      data-palette-gem={palette}
      className={cn("mn-gem-only mn-app-gem", props.className)}
    >
      <HiddenGemIcon
        palette={palette}
        className={props.iconClassName ?? "size-icon"}
      />
    </span>
  );
}
