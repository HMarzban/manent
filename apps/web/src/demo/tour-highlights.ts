// Curated Tour highlights and multi-window step helpers over the live Tour manifest.
import type { TourScenario } from "@manent/demo";
import { nameOf } from "../services/sync/index-entries.ts";

/** Six flagship scenarios spanning writing, live collaboration, offline survival, production locking and broadcast rundowns. */
export const TOUR_HIGHLIGHTS: readonly string[] = Object.freeze([
  "write-true-pages",
  "together-add-writers",
  "together-present",
  "offline-write",
  "production-locked-page",
  "rundown-time",
]);

const STEP_WINDOW = new RegExp("^In (\\p{Lu}\\p{Ll}*)'s window", "u");

/**
 * The companion window's person first name when `stepText` asks the person to act in one of `scenario`'s extra windows;
 * null when the step belongs to this window.
 */
export function otherWindowNameOfStep(
  stepText: string,
  scenario: TourScenario,
): string | null {
  if (scenario.setup.extraWindows.length === 0) return null;
  const named = STEP_WINDOW.exec(stepText)?.[1];
  if (named === undefined) return null;
  if (named === nameOf(scenario.setup.userId)) return null;
  const extraMatch = scenario.setup.extraWindows.some(
    (w) => nameOf(w.userId) === named,
  );
  return extraMatch ? named : null;
}
