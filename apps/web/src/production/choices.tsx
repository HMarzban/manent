// One choice among a few, as production's dialogs and forms offer it: the stock radio group, each choice labelled.
import { RadioGroup, RadioGroupItem } from "@manent/ui";
import { useEffect, useId, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";

export interface Choice<T extends string> {
  readonly value: T;
  readonly label: string;
}

/** `value` null: none chosen yet. */
export function Choices<T extends string>(props: {
  label: string;
  value: T | null;
  choices: readonly Choice<T>[];
  showLegend?: boolean;
  disabled?: boolean;
  autoFocusFirst?: boolean;
  onChoose(value: T): void;
  onKeyDown?(event: KeyboardEvent): void;
}): ReactNode {
  const {
    choices,
    onChoose,
    showLegend = false,
    disabled = false,
    autoFocusFirst = false,
  } = props;
  const id = useId();
  const legendId = `${id}-legend`;
  const groupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoFocusFirst) return;
    const first = groupRef.current?.querySelector<HTMLElement>(
      "[role='radio']:not([aria-disabled='true'])",
    );
    first?.focus({ preventScroll: true });
  }, [autoFocusFirst]);

  return (
    <div ref={groupRef} className="flex flex-col gap-1.5">
      {showLegend ? (
        <span id={legendId} className="text-meta font-medium text-fg-muted">
          {props.label}
        </span>
      ) : null}
      <RadioGroup
        aria-label={showLegend ? undefined : props.label}
        aria-labelledby={showLegend ? legendId : undefined}
        disabled={disabled}
        value={props.value}
        onValueChange={(chosen) => {
          const choice = choices.find((c) => c.value === chosen);
          if (choice !== undefined) onChoose(choice.value);
        }}
        onKeyDown={props.onKeyDown}
      >
        {choices.map((choice) => {
          const itemId = `${id}-${choice.value}`;
          return (
            <span
              key={choice.value}
              className="flex items-center gap-2 text-ui"
            >
              <RadioGroupItem
                id={itemId}
                value={choice.value}
                disabled={disabled}
              />
              <label
                htmlFor={itemId}
                className={
                  disabled
                    ? "cursor-not-allowed text-fg-muted"
                    : "cursor-pointer"
                }
              >
                {choice.label}
              </label>
            </span>
          );
        })}
      </RadioGroup>
    </div>
  );
}
