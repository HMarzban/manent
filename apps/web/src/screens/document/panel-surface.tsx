// Where a panel is drawn, beside the page or over it, and what a panel's list draws in each state.
import { Button, DOCUMENT_WORDS } from "@manent/ui";
import type { SurfaceRenderers } from "@manent/ui";
import type { CSSProperties, ReactNode } from "react";

// over the page, against its own edge of it; the page stays mounted under it
const OVER_PAGE: Readonly<Record<"start" | "end", CSSProperties>> =
  Object.freeze({
    start: { gridArea: "page", justifySelf: "start", zIndex: 10 },
    end: { gridArea: "page", justifySelf: "end", zIndex: 10 },
  });
// lying on the page, it has an overlay's elevation and an edge on the side facing the text, as a menu has
const OVER_PAGE_EDGE: Readonly<Record<"start" | "end", string>> = Object.freeze(
  { start: "border-e", end: "border-s" },
);

/** Beside the page, the panel takes its own grid area; `over` draws it over the page instead, at that edge. */
export function PanelPlace(props: {
  over: "start" | "end" | null;
  children: ReactNode;
}): ReactNode {
  if (props.over === null) return props.children;
  return (
    <div
      data-overlay=""
      className={`flex min-h-0 border-line shadow-overlay ${OVER_PAGE_EDGE[props.over]}`}
      style={OVER_PAGE[props.over]}
    >
      {props.children}
    </div>
  );
}

/** The list as it is while offline or read-only (nothing here changes it); nothing while it loads or is not yours. */
export function panelRenderers(content: {
  ready(): ReactNode;
  empty(): ReactNode;
}): SurfaceRenderers {
  return {
    ready: content.ready,
    empty: content.empty,
    loading: () => null,
    problem: (_state, reload) => (
      <div className="flex flex-col items-start gap-2 p-4 text-ui">
        <p>{DOCUMENT_WORDS.panelProblem}</p>
        <Button variant="outline" size="sm" onClick={reload}>
          {DOCUMENT_WORDS.reloadPanel}
        </Button>
      </div>
    ),
    offline: content.ready,
    read_only: content.ready,
    no_access: () => null,
  };
}
