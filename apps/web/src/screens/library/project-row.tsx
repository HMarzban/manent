// A project's row, which opens its first document: the view of a kind PROJECT_VIEWS has no line for.
import { LIBRARY_WORDS, Row, cn, formatWhen } from "@manent/ui";
import type { ReactNode } from "react";
import type { ProjectItem } from "../../services/ports.ts";
import { KindIcon, kindLabel } from "./project-kind.tsx";
import { PROJECT_ROW_ITEMS } from "./project-row-items.ts";
import { RowContextMenu, RowMenu, placeProps } from "./row-place.tsx";
import { useActiveDragWorkspace, useProjectDrag } from "./folder-dnd.ts";

export const KIND_COLUMN = "hidden w-col-kind shrink-0 truncate @2xl:block";
export const EDITED_COLUMN = "hidden w-col-edited shrink-0 truncate @xl:block";
const ROW_CELLS =
  "grid grid-cols-1 py-1 @xl:grid-cols-[minmax(0,1fr)_auto] @xl:gap-x-2 @xl:py-0 @2xl:grid-cols-[minmax(0,1fr)_auto_auto]";
const EDITED_CELL =
  "truncate tabular-nums @max-xl:text-meta @max-xl:text-fg-muted @xl:w-col-edited";

function lastEdited(edited: ProjectItem["lastEdited"], now: number): string {
  if ("changedSinceOpened" in edited) return LIBRARY_WORDS.changedSinceOpened;
  return LIBRARY_WORDS.edited(edited.byName, formatWhen(edited.at, now));
}

const ROW_ITEMS = PROJECT_ROW_ITEMS.filter((item) =>
  item.targets.includes("project"),
);

export function ProjectRow(props: {
  project: ProjectItem;
  shell: "web" | "desktop";
  now: number;
  open(docId: string): void;
}): ReactNode {
  const { project, shell, now, open } = props;
  const { firstDocId } = project;
  const { trailing, ...place } = placeProps(project.place, shell);
  const workspaceId = useActiveDragWorkspace();
  const { draggable, isDragging, dragHandlers } = useProjectDrag({
    workspaceId,
    projectId: project.projectId,
    projectTitle: project.title,
    disabled: place.unavailable !== undefined,
  });
  const hasMenu = ROW_ITEMS.length > 0 && place.unavailable === undefined;
  const entries = hasMenu
    ? ROW_ITEMS.map(({ id, Item }) => (
        <Item
          key={id}
          target="project"
          id={project.projectId}
          firstDocId={firstDocId}
        />
      ))
    : null;
  // a row that cannot be opened has no menu
  const menu = hasMenu ? (
    <RowMenu title={project.title}>{entries}</RowMenu>
  ) : undefined;
  const row = (
    <div
      draggable={draggable}
      data-drag-source={isDragging ? "true" : undefined}
      className="mn-drag-row"
      {...dragHandlers}
    >
      <Row
        leading={<KindIcon kind={project.kind} />}
        onActivate={firstDocId === null ? undefined : () => open(firstDocId)}
        trailing={trailing}
        menu={menu}
        {...place}
      >
        <span className={ROW_CELLS}>
          <span className="truncate font-semibold">{project.title}</span>
          <span className={cn(KIND_COLUMN, "text-fg-muted")}>
            {kindLabel(project.kind)}
          </span>
          <span className={EDITED_CELL}>
            {lastEdited(project.lastEdited, now)}
          </span>
        </span>
      </Row>
    </div>
  );
  return hasMenu ? (
    <RowContextMenu entries={entries}>{row}</RowContextMenu>
  ) : (
    row
  );
}
