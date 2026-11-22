// The region named Projects: the workspace's projects as a table of kind, last edit and place, or what to do when it holds none.
import {
  CommandButton,
  LIBRARY_WORDS,
  Row,
  VirtualRows,
  cn,
  formatWhen,
} from "@manent/ui";
import type { ReactNode } from "react";
import type { ProjectItem } from "../../services/ports.ts";
import { KindIcon, kindLabel } from "./project-kind.tsx";
import { PLACE_COLUMN, PLACE_HEAD, placeProps } from "./row-place.tsx";

// the Kind and Last edited columns, the same width in the head and in every row; a narrow table has no columns, and
// draws Last edited as the title's second line, which makes the row two lines high
const KIND_COLUMN = "hidden w-col-kind shrink-0 truncate @lg:block";
const EDITED_COLUMN = "hidden w-col-edited shrink-0 truncate @lg:block";
const ROW_CELLS =
  "grid grid-cols-1 py-1 @lg:grid-cols-[minmax(0,1fr)_auto_auto] @lg:gap-x-2 @lg:py-0";
const EDITED_CELL =
  "truncate tabular-nums @max-lg:text-meta @max-lg:text-fg-muted @lg:w-col-edited";

function lastEdited(edited: ProjectItem["lastEdited"], now: number): string {
  if (edited === null) return "";
  if ("changedSinceOpened" in edited) return LIBRARY_WORDS.changedSinceOpened;
  return LIBRARY_WORDS.edited(edited.byName, formatWhen(edited.at, now));
}

function ProjectRow(props: {
  project: ProjectItem;
  shell: "web" | "desktop";
  now: number;
  open(docId: string): void;
}): ReactNode {
  const { project, shell, now, open } = props;
  const { firstDocId } = project;
  return (
    <Row
      leading={<KindIcon kind={project.kind} />}
      onActivate={firstDocId === null ? undefined : () => open(firstDocId)}
      {...placeProps(project.place, shell)}
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
  );
}

/**
 * The Library's empty state: what it holds, and the ways to start. `problem` is the line saying the list could not be
 * loaded, or null; when it is given it leads, and the empty state reads as a quiet part of it.
 */
export function NoProjects(props: { problem: ReactNode }): ReactNode {
  const { problem } = props;
  return (
    <section
      aria-label={LIBRARY_WORDS.projectsRegion}
      className={cn(
        "flex flex-col items-start",
        problem === null ? "gap-4 pt-6" : "gap-2",
      )}
    >
      {problem}
      <p className={problem === null ? "text-display" : "text-ui"}>
        {LIBRARY_WORDS.empty}
      </p>
      <div className="flex flex-wrap gap-2">
        <CommandButton id="library.newScript" variant="outline" />
        <CommandButton id="library.newProject" variant="outline" />
      </div>
    </section>
  );
}

/** The workspace's projects; a workspace that holds none draws NoProjects instead. */
export function ProjectList(props: {
  projects: readonly ProjectItem[];
  shell: "web" | "desktop";
  now: number;
  open(docId: string): void;
}): ReactNode {
  const { projects, shell, now, open } = props;
  const renderRow = (index: number): ReactNode => {
    const project = projects[index];
    if (project === undefined) return null;
    return <ProjectRow project={project} shell={shell} now={now} open={open} />;
  };
  return (
    <section
      aria-label={LIBRARY_WORDS.projectsRegion}
      className="@container flex min-h-0 flex-1 flex-col"
    >
      <div className="mn-table flex min-h-0 flex-col">
        <div className="mn-table-head flex shrink-0 items-center gap-2 px-3">
          <h2 className="min-w-0 flex-1">{LIBRARY_WORDS.projectsHeading}</h2>
          <span className={KIND_COLUMN}>{LIBRARY_WORDS.kindColumn}</span>
          <span className={EDITED_COLUMN}>
            {LIBRARY_WORDS.lastEditedColumn}
          </span>
          <span aria-hidden="true" className={PLACE_HEAD} />
        </div>
        <div className={cn("min-h-0 flex-1", PLACE_COLUMN)}>
          <VirtualRows
            count={projects.length}
            rowHeight="one"
            label={LIBRARY_WORDS.projectsHeading}
            renderRow={renderRow}
          />
        </div>
      </div>
    </section>
  );
}
