// One choice of a few, drawn side by side: a single-choice toggle group.
import type { Choice } from "@manent/settings";
import type { KeyboardEvent, ReactNode } from "react";
import { ToggleGroup, ToggleGroupItem } from "../stock/toggle-group.tsx";

interface SegmentedProps {
  label: string;
  value: string;
  options: readonly Choice<string>[];
  onChange(value: string): void;
}

const ARROW_STEPS: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

/** An arrow key presses the next option, wrapping round, as a radio group does; pressing the pressed option keeps it. */
export function Segmented({
  label,
  value,
  options,
  onChange,
}: SegmentedProps): ReactNode {
  const onKeyDown = (event: KeyboardEvent): void => {
    const step = ARROW_STEPS[event.key];
    if (step === undefined) return;
    const at = options.findIndex((option) => option.value === value);
    const next = options[(at + step + options.length) % options.length];
    if (next !== undefined) onChange(next.value);
  };
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(pressed) => {
        const [chosen] = pressed;
        if (chosen !== undefined) onChange(chosen);
      }}
      onKeyDown={onKeyDown}
      variant="outline"
      spacing={0}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className="h-control text-ui"
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
