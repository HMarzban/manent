// Personal Board view density stored in `manent.view.board.<userId>` (never mutating shared CRDT data).
import type { KeyValueMap } from "@manent/settings";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { createLocalMap } from "../../services/local-map.ts";

export const BOARD_DENSITIES = ["fit", "comfortable", "compact"] as const;
export type BoardDensity = (typeof BOARD_DENSITIES)[number];

const isBoardDensity = (value: unknown): value is BoardDensity =>
  BOARD_DENSITIES.some((density) => density === value);

const densityMaps = new Map<string, KeyValueMap>();

/** The person's Board density choice, shared across their tabs on this device. */
export function useBoardDensity(): {
  density: BoardDensity;
  setDensity(density: BoardDensity): void;
} {
  const { storage, storageEvents } = useEnvironment();
  const { userId } = useServices();
  const map = useMemo(() => {
    const held = densityMaps.get(userId);
    if (held !== undefined) return held;
    const made = createLocalMap({
      storage,
      key: `manent.view.board.${userId}`,
      events: storageEvents,
    });
    densityMaps.set(userId, made);
    return made;
  }, [storage, storageEvents, userId]);

  const subscribe = useCallback(
    (listener: () => void) => map.subscribe(listener),
    [map],
  );
  const read = (): BoardDensity => {
    const raw = map.get("density");
    return isBoardDensity(raw) ? raw : "fit";
  };
  return {
    density: useSyncExternalStore(subscribe, read, read),
    setDensity: (density) => map.set("density", density),
  };
}
