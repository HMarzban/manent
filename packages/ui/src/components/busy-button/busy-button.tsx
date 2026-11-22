// The one busy button: while its work runs it reads the work's progressive label, keeps the width it had, and shows
// the spinner once the loading rule says so.
import { LoaderCircleIcon } from "lucide-react";
import { useCallback, useLayoutEffect, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import { SPINNER_AFTER_MS, useTiming } from "../../surfaces/timing.ts";
import { Button } from "../stock/button.tsx";

type BusyButtonProps = Omit<
  ComponentProps<typeof Button>,
  "children" | "style" | "focusableWhenDisabled"
> & {
  label: string;
  /** The work's progressive form ("Issuing Pink…"); not null while the work runs, when the button is disabled. */
  busyLabel: string | null;
};

/** True once `held` has been true for `afterMs`; false again as soon as it ends. Needs a `TimingProvider`. */
export function useHeldFor(held: boolean, afterMs: number): boolean {
  const { schedule } = useTiming();
  const [due, setDue] = useState(false);
  useLayoutEffect(() => {
    setDue(false);
    return held ? schedule(() => setDue(true), afterMs) : undefined;
  }, [held, afterMs, schedule]);
  return due;
}

/** Disabled while busy and while `disabled`, and focusable all the same, so focus stays on it when the work starts. Needs a `TimingProvider`. */
export function BusyButton({
  label,
  busyLabel,
  disabled,
  ...props
}: BusyButtonProps): ReactNode {
  const busy = busyLabel !== null;
  const spinning = useHeldFor(busy, SPINNER_AFTER_MS);
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
