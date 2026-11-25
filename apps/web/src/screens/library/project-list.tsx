// The region named Projects: the workspace's projects as a table of kind, last edit and place, each drawn by its kind's
// view, or what to do when it holds none.
import { CommandButton, LIBRARY_WORDS, VirtualRows, cn } from "@manent/ui";
import { FileTextIcon } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyHeroCard } from "../../empty-hero-card.tsx";
import type { ProjectItem } from "../../services/ports.ts";
import { EDITED_COLUMN, KIND_COLUMN, ProjectRow } from "./project-row.tsx";
import { PROJECT_VIEWS } from "./project-views.ts";
import type { ProjectViewProps } from "./project-views.ts";
import { PLACE_COLUMN, PLACE_HEAD } from "./row-place.tsx";

export { ProjectRow };

type Segment =
  | { kind: "plain"; projects: ProjectItem[] }
  | {
      kind: "view";
      project: ProjectItem;
      View: NonNullable<(typeof PROJECT_VIEWS)[number]>["View"];
    };

function segmentsOf(projects: readonly ProjectItem[]): Segment[] {
  const segments: Segment[] = [];
  for (const project of projects) {
    const custom = PROJECT_VIEWS.find((view) => view.kind === project.kind);
    if (custom !== undefined) {
      segments.push({ kind: "view", project, View: custom.View });
      continue;
    }
    const prev = segments.at(-1);
    if (prev?.kind === "plain") prev.projects.push(project);
    else segments.push({ kind: "plain", projects: [project] });
  }
  return segments;
}

function PlainTable(props: {
  projects: readonly ProjectItem[];
  shell: "web" | "desktop";
  now: number;
  open(docId: string): void;
  sole: boolean;
}): ReactNode {
  const { projects, shell, now, open, sole } = props;
  const renderRow = (index: number): ReactNode => {
    const project = projects[index];
    if (project === undefined) return null;
    return <ProjectRow project={project} shell={shell} now={now} open={open} />;
  };
  return (
    <div
      className={cn(
        "mn-table flex flex-col",
        sole ? "min-h-0 flex-1" : "shrink-0",
      )}
    >
      <div className="mn-table-head flex shrink-0 items-center gap-2 px-3">
        <h2 className="min-w-0 flex-1">{LIBRARY_WORDS.projectsHeading}</h2>
        <span className={KIND_COLUMN}>{LIBRARY_WORDS.kindColumn}</span>
        <span className={EDITED_COLUMN}>{LIBRARY_WORDS.lastEditedColumn}</span>
        <span className={PLACE_HEAD}>{LIBRARY_WORDS.statusColumn}</span>
      </div>
      <div className={cn(sole ? "min-h-0 flex-1" : undefined, PLACE_COLUMN)}>
        <VirtualRows
          count={projects.length}
          rowHeight="one"
          label={LIBRARY_WORDS.projectsHeading}
          renderRow={renderRow}
        />
      </div>
    </div>
  );
}

/**
 * The Library's empty state: a centred hero card with the ways to start, inside a scrollable region so short
 * viewports never clip it. `problem` is the line saying the list could not be loaded, or null; when given it leads
 * above the card.
 */
export function NoProjects(props: { problem: ReactNode }): ReactNode {
  const { problem } = props;
  return (
    <section
      aria-label={LIBRARY_WORDS.projectsRegion}
      className="min-h-0 flex-1 overflow-y-auto"
    >
      <div className="flex min-h-full flex-col items-center justify-center gap-4 p-6">
        {problem}
        <EmptyHeroCard
          icon={<FileTextIcon aria-hidden="true" className="size-5" />}
          title={LIBRARY_WORDS.empty}
          actions={
            <>
              <CommandButton id="file.import" variant="outline" />
              <CommandButton id="library.newScript" variant="outline" />
              <CommandButton id="library.newProject" variant="outline" />
            </>
          }
        />
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
  const segments = segmentsOf(projects);
  const sole = segments.length === 1 && segments[0]?.kind === "plain";
  const viewProps = (project: ProjectItem): ProjectViewProps => ({
    project,
    shell,
    now,
    open,
  });
  return (
    <section
      aria-label={LIBRARY_WORDS.projectsRegion}
      className="@container flex min-h-0 flex-1 flex-col"
    >
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          sole ? undefined : "gap-3 overflow-auto",
        )}
      >
        {segments.map((segment, i) =>
          segment.kind === "plain" ? (
            <PlainTable
              key={`plain-${i}`}
              projects={segment.projects}
              shell={shell}
              now={now}
              open={open}
              sole={sole}
            />
          ) : (
            <segment.View
              key={segment.project.projectId}
              {...viewProps(segment.project)}
            />
          ),
        )}
      </div>
    </section>
  );
}
