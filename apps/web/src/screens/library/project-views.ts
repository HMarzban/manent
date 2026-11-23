// A project of a kind as the Library draws it; a kind with no line is drawn as a row that opens its first document.
import type { ComponentType } from "react";
import type { ProjectItem, ProjectKind } from "../../services/ports.ts";

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

export const PROJECT_VIEWS: readonly ProjectView[] = [];
