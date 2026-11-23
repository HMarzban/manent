// One Tour scenario: whether it is done, its promise, its set-up control, its steps with the one ringed control, and what to check.
import type { TourScenario } from "@manent/demo";
import { Button, Row, TOUR_WORDS } from "@manent/ui";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import type { ControlState } from "../api.ts";
import { useAnnouncer } from "../shell/announcer-region.tsx";
import { tourActions, useTourStep } from "../state/tour.store.ts";
import type { SetupOutcome } from "./tour-setup.ts";
import { SERVER_STATUS_QUERY } from "./use-demo.ts";

type Refusal = Extract<SetupOutcome, { ok: false }>["reason"];

/** What stands in Set it up's place whatever the last set-up answered: the desktop app is needed, or the workspace is getting ready. */
export type SetupHold =
  | { kind: "desktop_only" }
  | { kind: "seeding"; workspace: string; done: number; total: number };

/** `again`: the line is followed by Set it up again; otherwise by no button. */
const REFUSALS: Readonly<Record<Refusal, { line: string; again: boolean }>> =
  Object.freeze({
    used: { line: TOUR_WORDS.setupUsed, again: false },
    seeding: { line: TOUR_WORDS.setupFailed, again: true },
    unknown: { line: TOUR_WORDS.setupFailed, again: true },
    unreachable: { line: TOUR_WORDS.setupUnreachable, again: true },
  });

const UNREACHABLE: SetupOutcome = Object.freeze({
  ok: false,
  reason: "unreachable",
});

/** The line in Set it up's place, and the button after it: null for none. */
function setupControl(
  hold: SetupHold | null,
  refusal: Refusal | null,
): { line: string | null; button: "set_up" | "again" | "disabled" | null } {
  if (hold?.kind === "desktop_only")
    return { line: TOUR_WORDS.desktopOnly, button: null };
  if (hold?.kind === "seeding")
    return {
      line: TOUR_WORDS.setupSeeding(hold.workspace, hold.done, hold.total),
      button: "disabled",
    };
  if (refusal === null) return { line: null, button: "set_up" };
  const { line, again } = REFUSALS[refusal];
  return { line, button: again ? "again" : null };
}

/** The server's state as the demo bar last heard it; null before its first answer and outside demo mode. */
function useServerState(): ControlState | null {
  const cache = useQueryClient().getQueryCache();
  const subscribe = useCallback(
    (onChange: () => void) => cache.subscribe(onChange),
    [cache],
  );
  // the bar's own query is the one being watched; one left by an earlier control is not
  const read = (): ControlState | null =>
    cache.find<ControlState>({
      queryKey: [SERVER_STATUS_QUERY],
      exact: false,
      type: "active",
    })?.state.data ?? null;
  return useSyncExternalStore(subscribe, read, read);
}

/**
 * Marks the control of step `at` with the Tour ring, a control drawn later (its screen or menu opened) as it arrives;
 * only what arrives is looked at, never the whole page again. Pressing the ringed control never moves the person on:
 * most steps are not done by one press (typing on the page, choosing in a menu), so they choose the next step in the
 * Tour. `at` null: nothing is ringed.
 */
function useTourRing(steps: TourScenario["steps"], at: number | null): void {
  useLayoutEffect(() => {
    if (at === null) return;
    const step = steps[at];
    if (step === undefined) return;
    const selector = `[data-tour="${CSS.escape(step.highlight)}"]`;
    const ring = (root: Element | Document): void => {
      if (root instanceof Element && root.matches(selector))
        root.setAttribute("data-tour-ring", "");
      for (const control of root.querySelectorAll(selector))
        control.setAttribute("data-tour-ring", "");
    };
    ring(document);
    const arrivals = new MutationObserver((records) => {
      for (const record of records) {
        if (record.target instanceof Element && record.type === "attributes")
          ring(record.target);
        for (const node of record.addedNodes)
          if (node instanceof Element) ring(node);
      }
    });
    arrivals.observe(document.body, {
      childList: true,
      subtree: true,
      attributeFilter: ["data-tour"],
    });
    return () => {
      arrivals.disconnect();
      // one step is ringed at a time, in one scenario, so this never unrings another step's control
      for (const control of document.querySelectorAll(selector))
        control.removeAttribute("data-tour-ring");
    };
  }, [steps, at]);
}

/**
 * `setUp` runs the scenario's set-up and never rejects; a server the demo bar hears as anything but running is not
 * asked. The last answer's sentence stands in the scenario's place and is announced politely; `hold` stands there
 * whatever it was.
 */
export function TourScenarioRow(props: {
  scenario: TourScenario;
  hold: SetupHold | null;
  done: boolean;
  onDone: (done: boolean) => void;
  setUp: (scenario: TourScenario) => Promise<SetupOutcome>;
}): ReactNode {
  const { scenario, hold, done, onDone, setUp } = props;
  const server = useServerState();
  const announcer = useAnnouncer();
  const promiseId = useId();
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [running, setRunning] = useState(false);
  const at = useTourStep(scenario.id);
  useTourRing(scenario.steps, at);
  const currentStep = useRef<HTMLElement | null>(null);
  // the step the person is on stays in view, whichever screen drew the Tour again
  useLayoutEffect(() => {
    currentStep.current?.scrollIntoView({ block: "center" });
  }, [at]);

  const run = async (): Promise<void> => {
    setRunning(true);
    // a server the demo bar hears as anything but running would not answer the windows set-up opens
    const outcome =
      server !== null && server !== "running"
        ? UNREACHABLE
        : await setUp(scenario);
    setRunning(false);
    const next = outcome.ok ? null : outcome.reason;
    setRefusal(next);
    if (outcome.ok) tourActions.open(scenario.id, 0);
    if (next !== null) announcer.announce(REFUSALS[next].line);
  };

  const { line, button } = setupControl(hold, refusal);
  return (
    <li className="flex flex-col items-start gap-2 text-ui">
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          aria-labelledby={promiseId}
          checked={done}
          onChange={(event) => {
            const ticked = event.currentTarget.checked;
            onDone(ticked);
            if (ticked && at !== null) tourActions.close();
          }}
          className="mt-0.5 size-4 shrink-0 accent-primary"
        />
        <p id={promiseId}>{scenario.promise}</p>
      </div>
      {line === null ? null : <p className="text-fg-muted">{line}</p>}
      {button === null ? null : (
        <Button
          variant="outline"
          disabled={button === "disabled" || running}
          onClick={() => void run()}
        >
          {button === "again" ? TOUR_WORDS.setItUpAgain : TOUR_WORDS.setItUp}
        </Button>
      )}
      <ol className="flex flex-col self-stretch">
        {scenario.steps.map((step, index) => (
          <li key={index}>
            <Row
              current={index === at}
              leading={<span className="w-6 tabular-nums">{index + 1}</span>}
              onActivate={() => tourActions.open(scenario.id, index)}
              rowRef={index === at ? currentStep : undefined}
            >
              {/* a step is read whole, never cut short */}
              <span className="whitespace-normal">{step.text}</span>
            </Row>
          </li>
        ))}
      </ol>
      <dl>
        <dt className="text-meta text-fg-muted">{TOUR_WORDS.whatToCheck}</dt>
        <dd>{scenario.check}</dd>
      </dl>
    </li>
  );
}
