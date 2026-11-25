// Themed Manent checkbox backed by a native input for label, keyboard and assistive-technology semantics.
import { CheckIcon } from "lucide-react";
import type { ChangeEvent, InputHTMLAttributes, ReactNode } from "react";
import { cn } from "../stock/index.ts";

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "onChange"
> {
  readonly checked: boolean;
  onCheckedChange?(checked: boolean): void;
  onChange?(event: ChangeEvent<HTMLInputElement>): void;
}

/** Accessible checkbox painted with Manent's accent and border tokens instead of OS form chrome. */
export function Checkbox(props: CheckboxProps): ReactNode {
  const {
    checked,
    disabled = false,
    className,
    onCheckedChange,
    onChange,
    ...rest
  } = props;
  return (
    <span
      className={cn(
        "relative inline-flex size-4 shrink-0 items-center justify-center",
        className,
      )}
    >
      <input
        {...rest}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => {
          onCheckedChange?.(event.currentTarget.checked);
          onChange?.(event);
        }}
        className={cn(
          "peer absolute inset-0 m-0 size-full opacity-0",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
      />
      <span
        aria-hidden="true"
        data-slot="checkbox"
        data-checked={checked ? "" : undefined}
        className={cn(
          "pointer-events-none flex size-4 items-center justify-center rounded-micro border transition-colors duration-(--dur-fast) peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-disabled:opacity-50",
          checked
            ? "border-accent-solid bg-accent-solid text-fg-on-accent"
            : "border-line-strong bg-well text-transparent",
        )}
      >
        <CheckIcon aria-hidden="true" className="size-3 stroke-[2.5]" />
      </span>
    </span>
  );
}
