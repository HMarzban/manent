// One choice of a few, drawn side by side: a single-choice toggle group.
import type { Choice } from "@manent/settings";
import { cn } from "cn";
import type { KeyboardEvent, ReactNode } from "react";
import { ToggleGroup, ToggleGroupItem } from "../stock/toggle-group.tsx";

interface SegmentedOption extends Choice<string> {
  icon?: ReactNode;
}

interface SegmentedProps {
  label: string;
  /** "sm" is 24 high, for the demo bar; otherwise 28. */
  size?: "default" | "sm";
  value: string;
  options: readonly SegmentedOption[];
  disabled?: boolean;
  onChange(value: string): void;
}

/** A horizontal arrow key presses the next option, wrapping round, as a radio group does; pressing the pressed option keeps it. */
export function Segmented({
  label,
  value,
  options,
  disabled,
  onChange,
  size = "default",
}: SegmentedProps): ReactNode {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (disabled || options.length === 0) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
      return;
    const isArrow = event.key === "ArrowRight" || event.key === "ArrowLeft";
    const isEdge = event.key === "Home" || event.key === "End";
    if (!isArrow && !isEdge) return;
    event.preventDefault();
    (event as { preventBaseUIHandler?: () => void }).preventBaseUIHandler?.();
    let nextIndex: number;
    if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = options.length - 1;
    } else {
      const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
      const step = (event.key === "ArrowRight" ? 1 : -1) * (rtl ? -1 : 1);
      const at = options.findIndex((option) => option.value === value);
      nextIndex =
        at === -1
          ? step > 0
            ? 0
            : options.length - 1
          : (at + step + options.length) % options.length;
    }
    const next = options[nextIndex];
    if (next === undefined) return;
    const items = event.currentTarget.querySelectorAll<HTMLElement>(
      '[data-slot="toggle-group-item"]',
    );
    items[nextIndex]?.focus();
    onChange(next.value);
  };
  return (
    <ToggleGroup
      aria-label={label}
      value={value === "" ? [] : [value]}
      disabled={disabled}
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
          className={cn(
            // pressed: the selected fill and the full-strength word, never hover's fill
            "gap-1.5 text-ui text-fg-muted aria-pressed:bg-selected aria-pressed:text-fg",
            size === "sm" ? "h-control-sm" : "h-control",
          )}
        >
          {option.icon}
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
