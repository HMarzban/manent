// One choice among a few, as production's dialogs and forms offer it: the stock radio group, each choice labelled.
import { RadioGroup, RadioGroupItem } from "@manent/ui";
import { useId } from "react";
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
  onChoose(value: T): void;
  onKeyDown?(event: KeyboardEvent): void;
}): ReactNode {
  const { choices, onChoose } = props;
  const id = useId();
  return (
    <RadioGroup
      aria-label={props.label}
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
          <span key={choice.value} className="flex items-center gap-2 text-ui">
            <RadioGroupItem id={itemId} value={choice.value} />
            <label htmlFor={itemId} className="cursor-pointer">
              {choice.label}
            </label>
          </span>
        );
      })}
    </RadioGroup>
  );
}
