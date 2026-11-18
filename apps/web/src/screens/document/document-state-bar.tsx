// The document's state bar: the facts of its source and of every feature that adds one, a line on each side.
import { StateBar, stateBarLines, useSubscribable } from "@manent/ui";
import type { StateFact, Subscribable } from "@manent/ui";
import { useLayoutEffect, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { ShellRegion } from "../../shell/regions.tsx";
import { STATE_FACT_SOURCES } from "./state-facts.ts";
import { useCommandActions } from "./status-bar.tsx";

const PAGE_REGION = "[data-region='page']";

/** The bar's appearing, going or changing height scrolls the page by as much, before the frame is drawn, so its lines stay put. */
function useKeepPageStill(bar: RefObject<HTMLElement | null>): void {
  const height = useRef<number | null>(null);
  useLayoutEffect(() => {
    const element = bar.current;
    if (element === null) return;
    const next = element.offsetHeight;
    const before = height.current;
    height.current = next;
    // the first height is where the page starts, not a move
    if (before === null || before === next) return;
    const page = element.ownerDocument.querySelector(PAGE_REGION);
    if (page !== null) page.scrollTop += next - before;
  });
}

export function DocumentStateBar(props: {
  docId: string;
  facts: Subscribable<readonly StateFact[]>;
}): ReactNode {
  const own = useSubscribable(props.facts);
  // a fixed list of hooks, called in the same order every render
  const added = STATE_FACT_SOURCES.flatMap((source) => source(props.docId));
  const { left, right } = stateBarLines([...own, ...added]);
  const { run, registered } = useCommandActions();
  const bar = useRef<HTMLDivElement>(null);
  useKeepPageStill(bar);
  return (
    // with no line the region is not drawn, so F6 passes it by
    <ShellRegion
      region="state_bar"
      className={left === null && right === null ? "hidden" : undefined}
    >
      <div ref={bar}>
        <StateBar left={left} right={right} run={run} registered={registered} />
      </div>
    </ShellRegion>
  );
}
