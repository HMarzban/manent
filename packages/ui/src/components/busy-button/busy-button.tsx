// The one busy button: while its work runs it reads the work's progressive label and keeps the width it had.
import { LoaderCircleIcon } from "lucide-react";
import { useCallback, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "../stock/button.tsx";

type BusyButtonProps = Omit<
  ComponentProps<typeof Button>,
  "children" | "style" | "focusableWhenDisabled"
> & {
  label: string;
  /** The work's progressive form ("Issuing Pink…"); not null while the work runs, when the button is disabled. */
  busyLabel: string | null;
  /** The spinner takes the icon's place; the caller decides when, by the loading rule. */
  spinning: boolean;
};

/** Disabled while busy and while `disabled`, and focusable all the same, so focus stays on it when the work starts. */
export function BusyButton({
  label,
  busyLabel,
  spinning,
  disabled,
  ...props
}: BusyButtonProps): ReactNode {
  const busy = busyLabel !== null;
  const [idleWidthPx, setIdleWidthPx] = useState<number | null>(null);
  // measured while idle, and again whenever the idle label changes; kept while the busy label shows
  const measure = useCallback(
    (node: HTMLButtonElement | null) => {
      if (node !== null && !busy) setIdleWidthPx(node.offsetWidth);
    },
    [busy, label],
  );
  return (
    <Button
      {...props}
      ref={measure}
      disabled={disabled === true || busy}
      focusableWhenDisabled
      style={busy && idleWidthPx !== null ? { width: idleWidthPx } : undefined}
    >
      {busyLabel ?? label}
      {busy && spinning ? (
        <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
      ) : null}
    </Button>
  );
}
