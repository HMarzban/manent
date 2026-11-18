// One Tour scenario: its promise, Set it up, its steps with the controls they ring, and what to check.
import type { TourScenario } from "@manent/demo";
import { Button, TOUR_WORDS } from "@manent/ui";
import { useLayoutEffect, useState } from "react";
import type { ReactNode } from "react";
import type { ControlState } from "../api.ts";
import { useAnnouncer } from "../shell/announcer-region.tsx";
import { useServerState } from "./use-demo.ts";

type Outcome = "failed" | "unreachable";

const OUTCOME_LINES: Readonly<Record<Outcome, string>> = Object.freeze({
  failed: TOUR_WORDS.setupFailed,
  unreachable: TOUR_WORDS.setupUnreachable,
});

/** Marks every control a step points at with the Tour ring while the scenario is drawn. */
function useTourRing(steps: TourScenario["steps"]): void {
  useLayoutEffect(() => {
    // the scenarios are drawn and removed with the Tour, together, so one scenario's removal never unrings another's control
    const ringed = steps.flatMap((step) => [
      ...document.querySelectorAll(
        `[data-tour="${CSS.escape(step.highlight)}"]`,
      ),
    ]);
    for (const control of ringed) control.setAttribute("data-tour-ring", "");
    return () => {
      for (const control of ringed) control.removeAttribute("data-tour-ring");
    };
  }, [steps]);
}

/** Null when the scenario was set up. */
function attempt(
  scenario: TourScenario,
  setUp: (scenario: TourScenario) => void,
  server: ControlState | null,
): Outcome | null {
  // a server the demo bar hears as anything but running would not answer the windows set-up opens
  if (server !== null && server !== "running") return "unreachable";
  try {
    setUp(scenario);
    return null;
  } catch {
    // the scenario's sentence says only that it did not work, never why
    return "failed";
  }
}

/** `setUp` opens the scenario's windows; when it throws, or the server does not answer, the scenario says so in its place. */
export function TourScenarioRow(props: {
  scenario: TourScenario;
  setUp: (scenario: TourScenario) => void;
}): ReactNode {
  const { scenario, setUp } = props;
  const server = useServerState();
  const announcer = useAnnouncer();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  useTourRing(scenario.steps);

  const run = (): void => {
    const next = attempt(scenario, setUp, server);
    setOutcome(next);
    if (next !== null) announcer.announce(OUTCOME_LINES[next]);
  };

  return (
    <li className="flex flex-col items-start gap-2 text-ui">
      <p>{scenario.promise}</p>
      {outcome === null ? null : (
        <p className="text-fg-muted">{OUTCOME_LINES[outcome]}</p>
      )}
      <Button onClick={run}>
        {outcome === null ? TOUR_WORDS.setItUp : TOUR_WORDS.setItUpAgain}
      </Button>
      <ol className="list-decimal ps-5">
        {scenario.steps.map((step, index) => (
          <li key={index}>{step.text}</li>
        ))}
      </ol>
      <dl>
        <dt className="text-meta text-fg-muted">{TOUR_WORDS.whatToCheck}</dt>
        <dd>{scenario.check}</dd>
      </dl>
    </li>
  );
}
