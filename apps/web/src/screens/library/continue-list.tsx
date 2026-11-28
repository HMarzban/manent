// Continue: the documents this person last worked on, across every project, each saying where it is; and the
// Library's Continue view, which draws it over the projects.
import {
  LIBRARY_FILES_WORDS,
  LIBRARY_WORDS,
  Row,
  Skeleton,
  SurfaceState,
  VirtualRows,
  cn,
  useSubscribable,
} from "@manent/ui";
import type { SurfaceRenderers, SurfaceStateValue } from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useEnvironment, useServices } from "../../services/context.tsx";
import type { ContinueItem, ProjectItem } from "../../services/ports.ts";
import { DOCUMENT_ROW_ITEMS } from "./document-row-items.ts";
import { DOCUMENT_ROW_LINES } from "./document-row-lines.ts";
import { useActiveDragWorkspace, useProjectDrag } from "./folder-dnd.ts";
import { KindIcon, kindLabel } from "./project-kind.tsx";
import { NoProjects, ProjectList } from "./project-list.tsx";
import {
  PLACE_COLUMN,
  PLACE_MENU_OFFSET,
  RowContextMenu,
  RowMenu,
  placeProps,
} from "./row-place.tsx";

// structured placeholder widths for the two library sections while the workspace is not known
const PLACEHOLDER_SECTIONS: readonly {
  readonly labelWidth: string;
  readonly rows: readonly {
    readonly title: string;
    readonly meta: string;
    readonly place: string;
  }[];
}[] = [
  {
    labelWidth: "w-16",
    rows: [
      { title: "w-44", meta: "w-28", place: "w-16" },
      { title: "w-56", meta: "w-24", place: "w-20" },
      { title: "w-36", meta: "w-32", place: "w-16" },
    ],
  },
  {
    labelWidth: "w-20",
    rows: [
      { title: "w-52", meta: "w-24", place: "w-16" },
      { title: "w-40", meta: "w-32", place: "w-20" },
      { title: "w-48", meta: "w-28", place: "w-16" },
    ],
  },
];

/**
 * The second line of `item`'s row: the first of DOCUMENT_ROW_LINES that has one, else its project and kind; a project
 * named as the document is not named twice.
 */
function useSecondLine(item: ContinueItem): string {
  let line: string | null = null;
  for (const source of DOCUMENT_ROW_LINES) {
    const said = source.useLine(item.docId);
    line ??= said;
  }
  if (line !== null) return line;
  const kind = kindLabel(item.kind);
  return item.projectTitle === item.title
    ? kind
    : [item.projectTitle, kind].join(" · ");
}

function ContinueRow(props: {
  item: ContinueItem;
  shell: "web" | "desktop";
  open(docId: string): void;
}): ReactNode {
  const { item, shell, open } = props;
  const { library } = useServices();
  const meta = useSecondLine(item);
  const { trailing, ...place } = placeProps(item.place, shell);
  const workspaceId = useActiveDragWorkspace();
  const projectIdSource = useMemo(
    () => library.documentProject(item.docId),
    [library, item.docId],
  );
  const projectId = useSubscribable(projectIdSource);
  const { draggable, isDragging, dragHandlers } = useProjectDrag({
    workspaceId,
    projectId,
    projectTitle: item.projectTitle,
    disabled: place.unavailable !== undefined,
  });
  const hasMenu =
    DOCUMENT_ROW_ITEMS.length > 0 && place.unavailable === undefined;
  const entries = hasMenu
    ? DOCUMENT_ROW_ITEMS.map(({ id, Item }) => (
        <Item key={id} docId={item.docId} />
      ))
    : null;
  // a row that cannot be opened has no menu
  const menu = hasMenu ? (
    <RowMenu title={item.title}>{entries}</RowMenu>
  ) : undefined;
  const row = (
    <div
      draggable={draggable}
      data-drag-source={isDragging ? "true" : undefined}
      className="mn-drag-row"
      {...dragHandlers}
    >
      <Row
        leading={<KindIcon kind={item.kind} />}
        meta={meta}
        onActivate={() => open(item.docId)}
        trailing={trailing}
        menu={menu}
        {...place}
      >
        <span className="font-semibold">{item.title}</span>
      </Row>
    </div>
  );
  return hasMenu ? (
    <RowContextMenu entries={entries}>{row}</RowContextMenu>
  ) : (
    row
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
      className="@container flex shrink-0 flex-col"
    >
      <div className="flex items-baseline justify-between gap-2 px-3 pt-4 pb-1">
        <h2 className="mn-group-label p-0!">{LIBRARY_WORDS.continueHeading}</h2>
        <span className="text-meta text-fg-muted">
          {LIBRARY_FILES_WORDS.continueNote}
        </span>
      </div>
      <div
        className={cn(
          "mn-table mn-continue-table min-h-0",
          PLACE_COLUMN,
          PLACE_MENU_OFFSET,
        )}
      >
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
    <div aria-busy="true" className="flex flex-col gap-6">
      {PLACEHOLDER_SECTIONS.map((section, sectionIndex) => (
        <div
          key={sectionIndex}
          aria-hidden="true"
          className="flex flex-col gap-1"
        >
          <div className="px-3 pt-4 pb-1">
            <Skeleton className={cn("h-3", section.labelWidth)} />
          </div>
          <div className="mn-table flex flex-col">
            {section.rows.map((row, rowIndex) => (
              <div
                key={rowIndex}
                data-placeholder=""
                className={cn(
                  "flex min-h-row-2 items-center gap-3 px-3 py-2",
                  rowIndex > 0 ? "border-t border-line" : undefined,
                )}
              >
                <Skeleton className="size-icon shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Skeleton className={cn("h-3.5 max-w-full", row.title)} />
                  <Skeleton className={cn("h-3 max-w-full", row.meta)} />
                </div>
                <Skeleton className={cn("h-4 shrink-0", row.place)} />
              </div>
            ))}
          </div>
        </div>
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
