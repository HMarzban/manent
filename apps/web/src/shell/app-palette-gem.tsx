// Status-bar Hidden Gem wired to live theme switching, private device-local collector stamps, and Appearance shortcut.
import type { StudioPaletteId } from "@manent/settings";
import { ActivePaletteGem, useSettingsStore } from "@manent/ui";
import { useRouter } from "@tanstack/react-router";
import { useCallback, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import {
  readGemSound,
  readKeptGems,
  recordKeptGem,
  writeGemSound,
} from "../boot/boot-cache.ts";
import { runAppearanceTransition } from "../screens/preferences/view-transition.ts";

interface CollectorSnapshot {
  readonly kept: readonly StudioPaletteId[];
  readonly sound: boolean;
}

const collectorListeners = new Set<() => void>();
let cachedSnapshot: CollectorSnapshot | null = null;

function readCollectorSnapshot(): CollectorSnapshot {
  if (cachedSnapshot === null) {
    cachedSnapshot = { kept: readKeptGems(), sound: readGemSound() };
  }
  return cachedSnapshot;
}

function emitCollector(): void {
  cachedSnapshot = { kept: readKeptGems(), sound: readGemSound() };
  for (const listener of collectorListeners) listener();
}

function subscribeCollector(listener: () => void): () => void {
  collectorListeners.add(listener);
  return () => {
    collectorListeners.delete(listener);
  };
}

const EMPTY_SNAPSHOT: CollectorSnapshot = Object.freeze({
  kept: [],
  sound: false,
});

/** Shared private device-local collector discovery tally and opt-in foley toggle across all gem vitrines. */
export function useGemCollector(): {
  readonly keptPalettes: readonly StudioPaletteId[];
  readonly soundEnabled: boolean;
  readonly onVisitPalette: (palette: StudioPaletteId) => void;
  readonly onToggleSound: () => void;
} {
  const snapshot = useSyncExternalStore(
    subscribeCollector,
    readCollectorSnapshot,
    () => EMPTY_SNAPSHOT,
  );

  const onVisitPalette = useCallback((palette: StudioPaletteId) => {
    const before = readKeptGems();
    if (before.includes(palette)) return;
    recordKeptGem(palette);
    emitCollector();
  }, []);

  const onToggleSound = useCallback(() => {
    writeGemSound(!readGemSound());
    emitCollector();
  }, []);

  return {
    keptPalettes: snapshot.kept,
    soundEnabled: snapshot.sound,
    onVisitPalette,
    onToggleSound,
  };
}

/** Active palette Hidden Gem for app status bars, with live theme preview/apply and Appearance shortcut. */
export function AppPaletteGem(props: {
  readonly className?: string;
}): ReactNode {
  const router = useRouter({ warn: false });
  const settings = useSettingsStore();
  const collector = useGemCollector();
  const pathname = router?.state.location.pathname ?? "";
  const searchStr = router?.state.location.searchStr ?? "";
  const onAppearance = pathname === "/preferences/appearance";

  const onOpenAppearance =
    router === undefined || onAppearance
      ? undefined
      : (): void => {
          const from = encodeURIComponent(
            pathname === "" ? "/" : `${pathname}${searchStr}`,
          );
          void router.navigate({
            href: `/preferences/appearance?from=${from}`,
          });
        };

  const onSelectPalette = useCallback(
    (next: StudioPaletteId) => {
      runAppearanceTransition({
        kind: "crossfade",
        mutate: () => {
          settings.set("appearance.palette", next);
        },
      });
    },
    [settings],
  );

  return (
    <ActivePaletteGem
      className={props.className}
      onOpenAppearance={onOpenAppearance}
      onSelectPalette={onSelectPalette}
      keptPalettes={collector.keptPalettes}
      onVisitPalette={collector.onVisitPalette}
      soundEnabled={collector.soundEnabled}
      onToggleSound={collector.onToggleSound}
    />
  );
}
