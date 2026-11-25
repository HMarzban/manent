// Where a panel is drawn, beside the page or over it, and what a panel's list draws in each state.
import { Button, DOCUMENT_WORDS, Skeleton } from "@manent/ui";
import type { SurfaceRenderers } from "@manent/ui";
import type { CSSProperties, ReactNode } from "react";

// over the page, against its own edge of it; the page stays mounted under it
const OVER_PAGE: Readonly<Record<"start" | "end", CSSProperties>> =
  Object.freeze({
    start: { gridArea: "page", justifySelf: "start", zIndex: 10 },
    end: { gridArea: "page", justifySelf: "end", zIndex: 10 },
  });
// the scrim dims the page under a panel lying on it, so the page's lines read as running under the panel rather than
// cut off; a press passes through it to the page, which closes the panel
const PAGE_SCRIM: CSSProperties = Object.freeze({
  gridArea: "page",
  zIndex: 10,
});
// lying on the page, it has an overlay's elevation and an edge on the side facing the text, as a menu has
const OVER_PAGE_EDGE: Readonly<Record<"start" | "end", string>> = Object.freeze(
  { start: "border-e", end: "border-s" },
);
const OVER_PAGE_SLIDE: Readonly<Record<"start" | "end", string>> =
  Object.freeze({
    start: "slide-in-from-start-4",
    end: "slide-in-from-end-4",
  });
const SKELETON_ROW_WIDTHS = ["w-3/5", "w-4/5", "w-1/2", "w-2/3"] as const;

/** Four structured list rows shown while a panel or its lazy chunk loads. */
export function PanelListSkeleton(): ReactNode {
  return (
    <div aria-busy="true" className="flex flex-col gap-1 p-2">
      {SKELETON_ROW_WIDTHS.map((width, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="flex min-h-row items-center gap-2 px-2"
        >
          <Skeleton className="size-3.5 shrink-0 rounded-micro" />
          <Skeleton className={`h-3 ${width}`} />
          <Skeleton className="ms-auto h-3 w-7 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/**
 * Beside the page, the panel takes its own grid area; `over` draws it over the page instead, at that edge, and dims the
 * page.
 */
export function PanelPlace(props: {
  over: "start" | "end" | null;
  children: ReactNode;
}): ReactNode {
  if (props.over === null) return props.children;
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none animate-in bg-scrim duration-(--dur-fast) ease-out fade-in-0"
        style={PAGE_SCRIM}
      />
      <div
        data-overlay=""
        className={`flex min-h-0 animate-in border-line shadow-overlay duration-(--dur-base) ease-out fade-in-0 ${OVER_PAGE_EDGE[props.over]} ${OVER_PAGE_SLIDE[props.over]}`}
        style={OVER_PAGE[props.over]}
      >
        {props.children}
      </div>
    </>
  );
}

/** The list as it is while offline or read-only (nothing here changes it); a skeleton while it loads and nothing if not yours. */
export function panelRenderers(content: {
  ready(): ReactNode;
  empty(): ReactNode;
}): SurfaceRenderers {
  return {
    ready: content.ready,
    empty: content.empty,
    loading: () => <PanelListSkeleton />,
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
