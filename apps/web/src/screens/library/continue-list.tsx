// Continue: the documents this person last worked on, across every project, each saying where it is; and the
// Library's Continue view, which draws it over the projects.
import {
  LIBRARY_WORDS,
  Row,
  Skeleton,
  SurfaceState,
  VirtualRows,
  cn,
} from "@manent/ui";
import type { SurfaceRenderers, SurfaceStateValue } from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { ReactNode } from "react";
import { useEnvironment } from "../../services/context.tsx";
import type { ContinueItem, ProjectItem } from "../../services/ports.ts";
import { DOCUMENT_ROW_ITEMS } from "./document-row-items.ts";
import { DOCUMENT_ROW_LINES } from "./document-row-lines.ts";
import { KindIcon, kindLabel } from "./project-kind.tsx";
import { NoProjects, ProjectList } from "./project-list.tsx";
import { PLACE_COLUMN, RowMenu, placeProps } from "./row-place.tsx";

// the placeholder rows drawn while the workspace is not known
const PLACEHOLDER_ROWS = 6;

/** The second line of `item`'s row: the first of DOCUMENT_ROW_LINES that has one, else its project and kind. */
function useSecondLine(item: ContinueItem): string {
  let line: string | null = null;
  for (const source of DOCUMENT_ROW_LINES) {
    const said = source.useLine(item.docId);
    line ??= said;
  }
  return line ?? [item.projectTitle, kindLabel(item.kind)].join(" · ");
}

function ContinueRow(props: {
  item: ContinueItem;
  shell: "web" | "desktop";
  open(docId: string): void;
}): ReactNode {
  const { item, shell, open } = props;
  const meta = useSecondLine(item);
  const { trailing, ...place } = placeProps(item.place, shell);
  // a row that cannot be opened has no menu
  const menu =
    DOCUMENT_ROW_ITEMS.length === 0 || place.unavailable !== undefined
      ? []
      : [
          <RowMenu title={item.title}>
            {DOCUMENT_ROW_ITEMS.map(({ id, Item }) => (
              <Item key={id} docId={item.docId} />
            ))}
          </RowMenu>,
        ];
  return (
    <Row
      leading={<KindIcon kind={item.kind} />}
      meta={meta}
      onActivate={() => open(item.docId)}
      trailing={[...menu, ...trailing]}
      {...place}
    >
      <span className="font-semibold">{item.title}</span>
    </Row>
  );
}

/** Nothing is drawn while the person has worked on nothing. */
export function ContinueList(props: {
  items: readonly ContinueItem[];
  shell: "web" | "desktop";
  open(docId: string): void;
}): ReactNode {
  const { items, shell, open } = props;
  if (items.length === 0) return null;
  const renderRow = (index: number): ReactNode => {
    const item = items[index];
    if (item === undefined) return null;
    return <ContinueRow item={item} shell={shell} open={open} />;
  };
  return (
    <section
      aria-label={LIBRARY_WORDS.continueHeading}
      className="@container flex max-h-1/3 shrink-0 flex-col"
    >
      <h2 className="mn-group-label">{LIBRARY_WORDS.continueHeading}</h2>
      <div className={cn("mn-table min-h-0 flex-1", PLACE_COLUMN)}>
        <VirtualRows
          count={items.length}
          rowHeight="two"
          label={LIBRARY_WORDS.continueHeading}
          renderRow={renderRow}
        />
      </div>
    </section>
  );
}

function Placeholders(): ReactNode {
  return (
    <div aria-hidden="true" className="flex flex-col gap-1">
      {Array.from({ length: PLACEHOLDER_ROWS }, (_, index) => (
        <Skeleton key={index} data-placeholder className="h-row-2" />
      ))}
    </div>
  );
}

/**
 * The Continue view: Continue, then the projects; the problem line above them when the list could not be loaded. The
 * column does not scroll: Continue keeps to a third of it and the projects take the rest, each scrolling in its card.
 */
export function ContinueView(props: {
  workspaceId: string | null;
  continueList: readonly ContinueItem[];
  projects: readonly ProjectItem[];
  problem: boolean;
}): ReactNode {
  const { workspaceId, continueList, projects } = props;
  const { where, now } = useEnvironment();
  const navigate = useNavigate();
  const [arrivedAt] = useState(() => now());
  const open = (docId: string) => void navigate({ href: `/s/${docId}` });
  const problem = <p className="text-ui">{LIBRARY_WORDS.problem}</p>;
  const lists =
    projects.length === 0 ? (
      <NoProjects problem={props.problem ? problem : null} />
    ) : (
      <>
        {props.problem ? problem : null}
        <ContinueList items={continueList} shell={where.shell} open={open} />
        <ProjectList
          projects={projects}
          shell={where.shell}
          now={now()}
          open={open}
        />
      </>
    );
  const render: SurfaceRenderers = {
    ready: () => lists,
    empty: () => lists,
    loading: () => <Placeholders />,
    // only a list that throws while it is drawn ends here
    problem: () => problem,
    // the Library has none of these: each row says where its document is, and the index lists only what the person may open
    offline: () => lists,
    read_only: () => lists,
    no_access: () => lists,
  };
  const state: SurfaceStateValue =
    workspaceId === null
      ? { kind: "loading", sinceMs: arrivedAt }
      : projects.length === 0
        ? { kind: "empty" }
        : { kind: "ready" };
  return <SurfaceState surface="library" state={state} render={render} />;
}
