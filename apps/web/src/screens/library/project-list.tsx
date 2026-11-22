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

// the Kind and Last edited columns, the same width in the head and in every row; a narrow table drops them
const KIND_COLUMN = "hidden w-col-kind shrink-0 truncate @lg:block";
const EDITED_COLUMN = "hidden w-col-edited shrink-0 truncate @lg:block";

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
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-semibold">
          {project.title}
        </span>
        <span className={cn(KIND_COLUMN, "text-fg-muted")}>
          {kindLabel(project.kind)}
        </span>
        <span className={cn(EDITED_COLUMN, "tabular-nums")}>
          {lastEdited(project.lastEdited, now)}
        </span>
      </span>
    </Row>
  );
}

/** The Library's empty state: what it holds, and the ways to start. */
function NoProjects(): ReactNode {
  return (
    <div className="flex flex-col items-start gap-4 pt-12">
      <p className="text-display">{LIBRARY_WORDS.empty}</p>
      <div className="flex flex-wrap gap-2">
        <CommandButton id="library.newScript" variant="outline" />
        <CommandButton id="library.newProject" variant="outline" />
      </div>
    </div>
  );
}

export function ProjectList(props: {
  projects: readonly ProjectItem[];
  shell: "web" | "desktop";
  now: number;
  open(docId: string): void;
}): ReactNode {
  const { projects, shell, now, open } = props;
  if (projects.length === 0)
    return (
      <section aria-label={LIBRARY_WORDS.projectsRegion}>
        <NoProjects />
      </section>
    );
  const renderRow = (index: number): ReactNode => {
    const project = projects[index];
    if (project === undefined) return null;
    return <ProjectRow project={project} shell={shell} now={now} open={open} />;
  };
  return (
    <section
      aria-label={LIBRARY_WORDS.projectsRegion}
      className="@container flex min-h-1/2 flex-1 flex-col"
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
        <div className={cn("min-h-0", PLACE_COLUMN)}>
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
