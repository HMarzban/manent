// A project of a kind as the Library draws it; a kind with no line is drawn as a row that opens its first document.
import type { ComponentType } from "react";
import type { ProjectItem, ProjectKind } from "../../services/ports.ts";
import { SeriesView } from "./series/series-view.tsx";
import { RundownsView } from "../../rundown/library-rundowns.tsx";

export interface ProjectViewProps {
  readonly project: ProjectItem;
  readonly shell: "web" | "desktop";
  /** Milliseconds since the epoch, for the last edit's time. */
  readonly now: number;
  open(docId: string): void;
}

export interface ProjectView {
  readonly kind: ProjectKind;
  readonly View: ComponentType<ProjectViewProps>;
}

export const PROJECT_VIEWS: readonly ProjectView[] = [
  { kind: "series", View: SeriesView },
  { kind: "show", View: RundownsView },
  { kind: "news", View: RundownsView },
];
