// One list row for every list: its states are the `.mn-row` rules of the theme.
import { cn } from "cn";
import { useContext } from "react";
import type { KeyboardEvent, ReactNode, Ref } from "react";
import { RowTabStop } from "./tab-stop.ts";

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
  /** The row's section is currently scrolled into view while the caret is elsewhere (ghost follow). */
  viewed?: boolean;
  /** A visible word for the current row ("Chosen"), drawn after the children. */
  currentLabel?: string;
  selected?: boolean;
  /** The word that says why the row cannot be opened; the row is drawn muted and never activates. */
  unavailable?: string;
  /** What the row opens is still loading: the row is drawn muted and busy, and still activates. */
  busy?: boolean;
  /** A 14 px icon, a 20 px avatar or a number: muted, and accent on the current row. */
  leading?: ReactNode;
  children: ReactNode;
  /** A second line; the row is then two lines high. */
  meta?: ReactNode;
  /** At most three items at the end of the row. */
  trailing?: readonly ReactNode[];
  /**
   * The row's menu handle, an `icon-sm` button: drawn over room the row keeps at its end, after its trailing items, as a
   * control of its own beside the row's, never inside it, so a row that is a button holds no button.
   */
  menu?: ReactNode;
  /**
   * When `"hover"`, hover-capable pointers omit the resting spacer and swap trailing items for the menu handle on
   * hover, focus-within or open menu so trailing metadata aligns flush with the row's edge. Default `"always"`.
   */
  menuReveal?: "always" | "hover";
  onActivate?: () => void;
  rowRef?: Ref<HTMLElement>;
}

/** Throws a RangeError for more than three trailing items. */
export function Row({
  current,
  viewed,
  currentLabel,
  selected,
  unavailable,
  busy,
  leading,
  children,
  meta,
  trailing = [],
  menu,
  menuReveal = "always",
  onActivate,
  rowRef,
}: RowProps): ReactNode {
  if (trailing.length > TRAILING_LIMIT) {
    throw new RangeError(
      `a row holds at most three trailing items, not ${trailing.length}`,
    );
  }
  const stop = useContext(RowTabStop);
  const activate = unavailable === undefined ? onActivate : undefined;
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Enter" || activate === undefined) return;
    event.preventDefault();
    activate();
  };
  const row = (
    <div
      ref={(node) => attach(rowRef, node)}
      className={cn(
        "mn-row flex items-center gap-2 px-3 text-ui",
        meta === undefined ? "min-h-row" : "min-h-row-2",
        (unavailable !== undefined || busy) && "text-fg-muted",
      )}
      aria-busy={busy ? "true" : undefined}
      aria-current={current ? "true" : undefined}
      data-viewed={viewed && !current ? "true" : undefined}
      aria-selected={selected ? "true" : undefined}
      aria-disabled={
        unavailable !== undefined && onActivate !== undefined
          ? "true"
          : undefined
      }
      tabIndex={onActivate === undefined ? undefined : stop === false ? -1 : 0}
      onClick={activate}
      onKeyDown={onKeyDown}
    >
      {leading === undefined ? null : (
        <span data-leading className="flex shrink-0 text-fg-muted">
          {leading}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{children}</span>
        {meta === undefined ? null : (
          <span className="truncate text-meta text-fg-muted">{meta}</span>
        )}
      </span>
      {currentLabel === undefined ? null : (
        <span className="shrink-0 whitespace-nowrap text-meta">
          {currentLabel}
        </span>
      )}
      {unavailable === undefined ? null : (
        <span className="shrink-0 whitespace-nowrap text-meta">
          {unavailable}
        </span>
      )}
      {trailing.map((item, index) => (
        <span
          key={index}
          data-trailing
          className="shrink-0 text-meta text-fg-muted"
        >
          {item}
        </span>
      ))}
      {menu === undefined ? null : (
        <span
          aria-hidden="true"
          data-menu-spacer=""
          className="size-6 shrink-0"
        />
      )}
    </div>
  );
  if (menu === undefined) return row;
  return (
    <div
      data-row-menu
      data-menu-reveal={menuReveal === "hover" ? "hover" : undefined}
      className="relative"
    >
      {row}
      <span
        data-menu-handle=""
        className="absolute inset-y-0 end-2 flex items-center"
      >
        {menu}
      </span>
    </div>
  );
}
