// Focused Stepper framing pieces: high-signal persona/window scope notice and previous/next footer controls.
import type { TourScenario } from "@manent/demo";
import { Avatar, Button, TOUR_WORDS } from "@manent/ui";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import { initialsOf } from "../initials.ts";
import { fullNameOf, nameOf } from "../services/sync/index-entries.ts";
import { tourActions, useTourStep } from "../state/tour.store.ts";

/** High-signal persona & window summary shown only when the scenario switches person or opens a second window. */
export function ScopeNotice(props: {
  scenario: TourScenario;
  currentUserId: string;
}): ReactNode {
  const { scenario, currentUserId } = props;
  const primaryId = scenario.setup.userId;
  const extraId = scenario.setup.extraWindows[0]?.userId ?? null;
  const switches = primaryId !== currentUserId;
  if (!switches && extraId === null) return null;

  const primaryFirst = nameOf(primaryId);
  const extraFirst = extraId === null ? null : nameOf(extraId);
  const text =
    switches && extraFirst !== null
      ? TOUR_WORDS.tabAndWindow(primaryFirst, extraFirst)
      : extraFirst !== null
        ? TOUR_WORDS.opensWindow(extraFirst)
        : TOUR_WORDS.tabBecomes(primaryFirst);

  const primaryFull = fullNameOf(primaryId);
  const extraFull =
    extraId !== null && extraId !== primaryId ? fullNameOf(extraId) : null;

  return (
    <div className="flex items-center gap-2 text-meta text-fg-muted">
      <span className="mn-avatar-overlap flex shrink-0 items-center">
        <Avatar
          name={primaryFull}
          initials={initialsOf(primaryFull)}
          colour={null}
          size="sm"
          decorative
        />
        {extraFull !== null ? (
          <Avatar
            name={extraFull}
            initials={initialsOf(extraFull)}
            colour={null}
            size="sm"
            decorative
          />
        ) : null}
      </span>
      <span>{text}</span>
    </div>
  );
}

/** Previous / Next / Mark ticked and next navigation bar at the foot of the Focused Stepper. */
export function StepperFooter(props: {
  scenario: TourScenario;
  done: boolean;
  hasNextScenario: boolean;
  onTickAndNext: () => void;
  onNextScenario: () => void;
}): ReactNode {
  const { scenario, done, hasNextScenario, onTickAndNext, onNextScenario } =
    props;
  const at = useTourStep(scenario.id);
  const total = scenario.steps.length;
  const index = at ?? 0;
  const isFirst = at === null || index <= 0;
  const isLast = at !== null && index >= total - 1;

  return (
    <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
      <Button
        variant="ghost"
        size="sm"
        disabled={isFirst}
        onClick={() => tourActions.open(scenario.id, Math.max(0, index - 1))}
      >
        <ChevronLeftIcon aria-hidden="true" className="size-icon" />
        {TOUR_WORDS.previous}
      </Button>
      {!isLast ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            tourActions.open(
              scenario.id,
              at === null ? 0 : Math.min(total - 1, index + 1),
            )
          }
        >
          {TOUR_WORDS.next}
          <ChevronRightIcon aria-hidden="true" className="size-icon" />
        </Button>
      ) : !done ? (
        <Button variant="default" size="sm" onClick={onTickAndNext}>
          <CheckIcon aria-hidden="true" className="size-icon" />
          {hasNextScenario
            ? TOUR_WORDS.markTickedAndNext
            : TOUR_WORDS.markTicked}
        </Button>
      ) : hasNextScenario ? (
        <Button variant="outline" size="sm" onClick={onNextScenario}>
          {TOUR_WORDS.next}
          <ChevronRightIcon aria-hidden="true" className="size-icon" />
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled>
          <CheckIcon aria-hidden="true" className="size-icon" />
          {TOUR_WORDS.ticked}
        </Button>
      )}
    </div>
  );
}
