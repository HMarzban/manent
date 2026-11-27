// Curated Tour highlights, step validation and multi-window step helpers over the live Tour manifest.
import { TOUR, TOUR_HIGHLIGHTS, isShown } from "@manent/demo";
import type { TourScenario } from "@manent/demo";
import { nameOf } from "../services/sync/index-entries.ts";

export { TOUR_HIGHLIGHTS };

const SHOWN_SCENARIOS = Object.freeze(TOUR.scenarios.filter(isShown));

/** Whether `scenarioId` and zero-based `step` refer to a currently shown Tour step. */
export function isValidActiveTourStep(
  scenarioId: string,
  step: number,
): boolean {
  const scenario = SHOWN_SCENARIOS.find((s) => s.id === scenarioId);
  return scenario !== undefined && step >= 0 && step < scenario.steps.length;
}

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
