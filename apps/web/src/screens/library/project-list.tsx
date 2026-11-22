// The region named Projects: the workspace's projects as a table of kind, last edit and place, or what to do when it holds none.
import {
  CommandButton,
  LIBRARY_WORDS,
  Row,
  VirtualRows,
  formatWhen,
} from "@manent/ui";
import type { ReactNode } from "react";
import type { ProjectItem } from "../../services/ports.ts";
import { PLACE_COLUMN, kindLabel, placeProps } from "./continue-list.tsx";

// the Kind and Last edited columns, the same width in the header and in every row
const KIND_COLUMN = "w-24 shrink-0 truncate";
const EDITED_COLUMN = "w-44 shrink-0 truncate";

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
      onActivate={firstDocId === null ? undefined : () => open(firstDocId)}
      {...placeProps(project.place, shell)}
    >
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate">{project.title}</span>
        <span className={KIND_COLUMN}>{kindLabel(project.kind)}</span>
        <span className={EDITED_COLUMN}>
          {lastEdited(project.lastEdited, now)}
        </span>
      </span>
    </Row>
  );
}

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
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex items-center gap-2 px-2 py-1 text-micro text-fg-muted uppercase">
        <h2 className="min-w-0 flex-1">{LIBRARY_WORDS.projectsHeading}</h2>
        {projects.length === 0 ? null : (
          <>
            <span className={KIND_COLUMN}>{LIBRARY_WORDS.kindColumn}</span>
            <span className={EDITED_COLUMN}>
              {LIBRARY_WORDS.lastEditedColumn}
            </span>
            <span className={PLACE_COLUMN} />
          </>
        )}
      </div>
      {projects.length === 0 ? (
        <div className="flex flex-col items-start gap-2 px-2 py-4">
          <p className="text-ui">{LIBRARY_WORDS.empty}</p>
          <div className="flex gap-2">
            <CommandButton id="file.import" variant="outline" />
            <CommandButton id="library.newScript" variant="outline" />
            <CommandButton id="library.newProject" variant="outline" />
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <VirtualRows
            count={projects.length}
            rowHeight="one"
            label={LIBRARY_WORDS.projectsHeading}
            renderRow={renderRow}
          />
        </div>
      )}
    </section>
  );
}
