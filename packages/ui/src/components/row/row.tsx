// One list row for every list: its states are the `.mn-row` rules of the theme.
import { cn } from "cn";
import type { KeyboardEvent, ReactNode, Ref } from "react";

const TRAILING_LIMIT = 3;

// a row is a div, and its ref is typed for any element
const attach = (
  ref: Ref<HTMLElement> | undefined,
  node: HTMLElement | null,
): void => {
  if (typeof ref === "function") ref(node);
  else if (ref) ref.current = node;
};

interface RowProps {
  current?: boolean;
  /** A visible word for the current row ("Chosen"), drawn after the children. */
  currentLabel?: string;
  selected?: boolean;
  /** The word that says why the row cannot be opened; the row is drawn muted and never activates. */
  unavailable?: string;
  leading?: ReactNode;
  children: ReactNode;
  /** A second line; the row is then two lines high. */
  meta?: ReactNode;
  /** At most three items at the end of the row. */
  trailing?: readonly ReactNode[];
  onActivate?: () => void;
  rowRef?: Ref<HTMLElement>;
}

/** Throws a RangeError for more than three trailing items. */
export function Row({
  current,
  currentLabel,
  selected,
  unavailable,
  leading,
  children,
  meta,
  trailing = [],
  onActivate,
  rowRef,
}: RowProps): ReactNode {
  if (trailing.length > TRAILING_LIMIT) {
    throw new RangeError(
      `a row holds at most three trailing items, not ${trailing.length}`,
    );
  }
  const activate = unavailable === undefined ? onActivate : undefined;
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Enter" || activate === undefined) return;
    event.preventDefault();
    activate();
  };
  return (
    <div
      ref={(node) => attach(rowRef, node)}
      className={cn(
        "mn-row flex items-center gap-2 px-2 text-ui",
        meta === undefined ? "min-h-row" : "min-h-row-2",
        unavailable !== undefined && "text-fg-muted",
      )}
      aria-current={current ? "true" : undefined}
      aria-selected={selected ? "true" : undefined}
      aria-disabled={
        unavailable !== undefined && onActivate !== undefined
          ? "true"
          : undefined
      }
      tabIndex={onActivate === undefined ? undefined : 0}
      onClick={activate}
      onKeyDown={onKeyDown}
    >
      {leading}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{children}</span>
        {meta === undefined ? null : (
          <span className="truncate text-meta text-fg-muted">{meta}</span>
        )}
      </span>
      {currentLabel === undefined ? null : (
        <span className="text-meta">{currentLabel}</span>
      )}
      {unavailable === undefined ? null : (
        <span className="text-meta">{unavailable}</span>
      )}
      {trailing.map((item, index) => (
        <span key={index} data-trailing className="text-meta text-fg-muted">
          {item}
        </span>
      ))}
    </div>
  );
}
