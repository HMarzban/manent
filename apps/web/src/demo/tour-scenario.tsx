// One Tour scenario: whether it is done, its promise, its set-up control, its steps with the one ringed control, and what to check.
import type { TourScenario } from "@manent/demo";
import { Button, Row, TOUR_WORDS } from "@manent/ui";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLinkIcon } from "lucide-react";
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
import {
  tourActions,
  useTourLocateNonce,
  useTourRefusal,
  useTourStep,
} from "../state/tour.store.ts";
import type { TourRefusal } from "../state/tour.store.ts";
import { otherWindowNameOfStep } from "./tour-highlights.ts";
import { useTourRing } from "./tour-ring.ts";
import type { SetupOutcome } from "./tour-setup.ts";
import { ScopeNotice } from "./tour-stepper-chrome.tsx";
import { SERVER_STATUS_QUERY } from "./use-demo.ts";

/**
 * What stands in Set it up's place whatever the last set-up answered: the desktop app is needed, the workspace is
 * getting ready, or it could not get ready.
 */
export type SetupHold =
  | { kind: "desktop_only" }
  | { kind: "seeding"; workspace: string; done: number; total: number }
  | { kind: "seeding_failed"; workspace: string };

/** `again`: the line is followed by Set it up again; otherwise by no button. */
const REFUSALS: Readonly<
  Record<TourRefusal, { line: string; again: boolean }>
> = Object.freeze({
  used: { line: TOUR_WORDS.setupUsed, again: false },
  seeding: { line: TOUR_WORDS.setupFailed, again: true },
  unknown: { line: TOUR_WORDS.setupFailed, again: true },
  unreachable: { line: TOUR_WORDS.setupUnreachable, again: true },
  popup_blocked: { line: TOUR_WORDS.setupPopupBlocked, again: true },
});

const UNREACHABLE: SetupOutcome = Object.freeze({
  ok: false,
  reason: "unreachable",
});

/** The line in Set it up's place, and the button after it: null for none. */
function setupControl(
  hold: SetupHold | null,
  refusal: TourRefusal | null,
): { line: string | null; button: "set_up" | "again" | "disabled" | null } {
  if (hold?.kind === "desktop_only")
    return { line: TOUR_WORDS.desktopOnly, button: null };
  if (hold?.kind === "seeding")
    return {
      line: TOUR_WORDS.setupSeeding(hold.workspace, hold.done, hold.total),
      button: "disabled",
    };
  if (hold?.kind === "seeding_failed")
    return {
      line: TOUR_WORDS.setupSeedingFailed(hold.workspace),
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
  currentUserId?: string;
}): ReactNode {
  const { scenario, hold, done, onDone, setUp, currentUserId } = props;
  const server = useServerState();
  const announcer = useAnnouncer();
  const promiseId = useId();
  const refusal = useTourRefusal(scenario.id);
  const [running, setRunning] = useState(false);
  const at = useTourStep(scenario.id);
  const locateNonce = useTourLocateNonce();
  const activeStepText =
    at === null ? null : (scenario.steps[at]?.text ?? null);
  const otherWindow =
    activeStepText === null
      ? null
      : otherWindowNameOfStep(activeStepText, scenario);
  useTourRing(scenario.steps, at, otherWindow === null, locateNonce);

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
    tourActions.setRefusal(scenario.id, next);
    if (outcome.ok) tourActions.open(scenario.id, 0);
    if (next !== null) announcer.announce(REFUSALS[next].line);
  };

  const { line, button } = setupControl(hold, refusal);

  return (
    <div className="flex flex-col gap-3 text-ui">
      <div className="flex flex-col items-start gap-2.5 rounded-surface border border-line bg-raised p-3">
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
          <p id={promiseId} className="font-medium text-fg">
            {scenario.promise}
          </p>
        </div>
        {currentUserId !== undefined ? (
          <ScopeNotice scenario={scenario} currentUserId={currentUserId} />
        ) : null}
        {line === null ? null : (
          <p className="text-meta text-fg-muted">{line}</p>
        )}
        {button === null ? null : (
          <Button
            variant="outline"
            disabled={button === "disabled" || running}
            onClick={() => void run()}
          >
            {button === "again" || at !== null
              ? TOUR_WORDS.setItUpAgain
              : TOUR_WORDS.setItUp}
          </Button>
        )}
      </div>

      <ol className="flex flex-col gap-0.5 self-stretch">
        {scenario.steps.map((step, index) => {
          const companion = otherWindowNameOfStep(step.text, scenario);
          return (
            <li key={index}>
              <Row
                current={index === at}
                leading={
                  <span className="w-6 tabular-nums text-fg-muted">
                    {index + 1}
                  </span>
                }
                onActivate={() => tourActions.open(scenario.id, index)}
                rowRef={index === at ? currentStep : undefined}
              >
                {/* a step is read whole, never cut short */}
                <span className="flex flex-col gap-1 whitespace-normal">
                  {companion !== null ? (
                    <span className="mn-tag self-start gap-1">
                      <ExternalLinkIcon
                        aria-hidden="true"
                        className="size-3 shrink-0"
                      />
                      {TOUR_WORDS.inWindow(companion)}
                    </span>
                  ) : null}
                  <span>{step.text}</span>
                </span>
              </Row>
            </li>
          );
        })}
      </ol>

      <dl className="flex flex-col gap-1 rounded-surface border border-line bg-raised p-3">
        <dt className="text-micro font-semibold tracking-wide text-fg-muted uppercase">
          {TOUR_WORDS.whatToCheck}
        </dt>
        <dd className="text-ui text-fg">{scenario.check}</dd>
      </dl>
    </div>
  );
}
