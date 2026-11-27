// Details → Script → Goal: personal daily page or word goal with live progress bar, and timed sprint controls.
import {
  Button,
  Segmented,
  WRITING_TOOLS_WORDS,
  cn,
  useSubscribable,
} from "@manent/ui";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { ChangeEvent, KeyboardEvent, ReactNode } from "react";
import { formatMmSs } from "../../goals/goal-model.ts";
import type { GoalKind } from "../../goals/goal-model.ts";
import { endSprint } from "../../goals/sprint.ts";
import { useScriptGoal } from "../../goals/use-goal.ts";
import { useServices } from "../../services/context.tsx";
import { useActiveSprint } from "../../state/sprint.store.ts";

const UNIT_OPTIONS: readonly { value: GoalKind; label: string }[] =
  Object.freeze([
    { value: "pages", label: WRITING_TOOLS_WORDS.goalPages },
    { value: "words", label: WRITING_TOOLS_WORDS.goalWords },
  ]);

/** Personal daily goal and timed sprint controls inside Details → Script. */
export function GoalSection(props: { docId: string }): ReactNode {
  const { docId } = props;
  const services = useServices();
  const docKindSource = useMemo(
    () => services.library.docKindOf(docId),
    [services.library, docId],
  );
  const docKind = useSubscribable(docKindSource);
  const scriptStore = useMemo(
    () => services.openScriptStore(docId),
    [services, docId],
  );
  const subscribeFormat = useCallback(
    (listener: () => void) => scriptStore.subscribe("script.format", listener),
    [scriptStore],
  );
  const format = useSyncExternalStore(subscribeFormat, () =>
    scriptStore.get("script.format"),
  );

  const { goal, done, setGoal, removeGoal } = useScriptGoal(docId);
  const activeSprint = useActiveSprint();
  const sprintRunning = activeSprint !== null;
  const inputId = useId();
  const reasonId = useId();

  const [draftUnit, setDraftUnit] = useState<GoalKind>("pages");
  const [draftText, setDraftText] = useState<string>("");

  useEffect(() => {
    if (goal === null) {
      setDraftText("");
    } else {
      setDraftUnit(goal.kind);
      setDraftText(String(goal.target));
    }
  }, [goal?.kind, goal?.target, goal === null]);

  if (docKind !== "script" || format === "ink") return null;

  const commitNumber = (raw: string, unit: GoalKind): void => {
    const trimmed = raw.trim();
    if (trimmed === "") {
      if (goal !== null) removeGoal();
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 1) return;
    setGoal(unit, parsed);
  };

  const onInputChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const next = event.target.value;
    setDraftText(next);
    commitNumber(next, draftUnit);
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") commitNumber(draftText, draftUnit);
  };

  const onUnitChange = (nextUnit: GoalKind): void => {
    setDraftUnit(nextUnit);
    if (draftText.trim() !== "") commitNumber(draftText, nextUnit);
    else if (goal !== null) setGoal(nextUnit, goal.target);
  };

  const progressRatio =
    goal === null || goal.target <= 0
      ? 0
      : Math.max(0, Math.min(1, done / goal.target));
  const goalReached = goal !== null && done >= goal.target;
  const sprintTime =
    activeSprint !== null
      ? formatMmSs(Math.ceil(activeSprint.remainingMs / 1000))
      : null;

  return (
    <div
      data-tour="script.goal"
      className="flex flex-col gap-2 border-t border-line pt-3"
    >
      <div className="flex flex-col gap-0.5">
        <h3 className="text-ui font-semibold text-fg">
          {WRITING_TOOLS_WORDS.goal}
        </h3>
        <p className="text-meta text-fg-muted">
          {WRITING_TOOLS_WORDS.goalScope}
        </p>
      </div>
      {goal === null ? (
        <p className="text-meta text-fg-muted">
          {WRITING_TOOLS_WORDS.goalEmpty}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5 rounded-control border border-line bg-subtle p-2">
          <div className="flex items-center justify-between gap-2 text-meta tabular-nums">
            <span
              className={cn(goalReached ? "font-medium text-ok" : "text-fg")}
            >
              {WRITING_TOOLS_WORDS.goalReadout(done, goal.target, goal.kind)}
            </span>
            {goalReached ? (
              <span className="font-medium text-ok">
                {WRITING_TOOLS_WORDS.goalReached}
              </span>
            ) : null}
          </div>
          <div className="mn-progress-track">
            <div
              className="mn-progress-fill"
              style={{ transform: `scaleX(${progressRatio})` }}
            />
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={inputId} className="shrink-0 text-ui text-fg-muted">
          {WRITING_TOOLS_WORDS.goalEachDay}
        </label>
        <input
          id={inputId}
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          aria-label={WRITING_TOOLS_WORDS.goal}
          value={draftText}
          onChange={onInputChange}
          onKeyDown={onInputKeyDown}
          onBlur={() => commitNumber(draftText, draftUnit)}
          className="h-control-sm w-16 rounded-control border border-line bg-well px-2 text-ui text-fg tabular-nums outline-none focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring"
        />
        <Segmented
          label={WRITING_TOOLS_WORDS.goal}
          value={draftUnit}
          options={UNIT_OPTIONS}
          onChange={onUnitChange}
        />
      </div>
      {sprintTime !== null ? (
        <div className="flex items-center justify-between gap-2 rounded-control border border-line bg-subtle px-2.5 py-1.5 text-meta tabular-nums">
          <span
            role="status"
            aria-live="polite"
            className="font-medium text-fg"
          >
            {WRITING_TOOLS_WORDS.sprintRemaining(sprintTime)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-control-sm cursor-pointer text-fg-muted hover:text-fg"
            onClick={endSprint}
          >
            {WRITING_TOOLS_WORDS.sprintEnd}
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <Button
          variant="outline"
          size="sm"
          data-tour="sprint.start"
          aria-disabled={sprintRunning ? true : undefined}
          aria-describedby={sprintRunning ? reasonId : undefined}
          className={
            sprintRunning ? "cursor-not-allowed opacity-50" : "cursor-pointer"
          }
          onClick={() => services.commands.run("sprint.start", "control")}
        >
          {WRITING_TOOLS_WORDS.sprintStart}
        </Button>
        {goal === null ? null : (
          <Button
            variant="ghost"
            size="sm"
            className="cursor-pointer text-fg-muted hover:text-fg"
            onClick={removeGoal}
          >
            {WRITING_TOOLS_WORDS.goalRemove}
          </Button>
        )}
      </div>
      {sprintRunning ? (
        <p id={reasonId} className="text-meta text-fg-muted">
          {WRITING_TOOLS_WORDS.sprintStartDisabled}
        </p>
      ) : null}
    </div>
  );
}
