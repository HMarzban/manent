// One key press the page and the native menu both hear runs its command once.
import type { CommandService, RunSource } from "@manent/commands";

/** A run from one of a key and the native menu is the echo of the other's when it follows within this. */
const DUPLICATE_PRESS_MS = 100;

const isPress = (source: RunSource): source is "key" | "native_menu" =>
  source === "key" || source === "native_menu";

/**
 * `service`, but a run of a command from "key" or "native_menu" that follows its run from the other one by less than
 * `DUPLICATE_PRESS_MS` is dropped and answers "ran": the command ran once, for both. `now` is in milliseconds.
 */
export function dedupedService(
  service: CommandService,
  now: () => number,
): CommandService {
  const lastPress = new Map<string, { source: RunSource; at: number }>();
  return {
    run(id, source) {
      if (!isPress(source)) return service.run(id, source);
      const last = lastPress.get(id);
      const at = now();
      if (
        last !== undefined &&
        last.source !== source &&
        at - last.at < DUPLICATE_PRESS_MS
      ) {
        lastPress.delete(id);
        return "ran";
      }
      lastPress.set(id, { source, at });
      return service.run(id, source);
    },
    state: (id) => service.state(id),
    subscribe: (listener) => service.subscribe(listener),
  };
}
