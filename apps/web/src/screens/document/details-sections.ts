// The Details tab's sections, one line per section, each in its scope.
import type { ComponentType } from "react";
import { WriterSection } from "../../assignment/writer-section.tsx";
import { ImportSection } from "../../import/import-section.tsx";
import { ProductionGroup } from "../../production/production-group.tsx";
import { ChecksSection } from "./checks-section.tsx";
import { LayoutGroup } from "./layout-group.tsx";
import { SceneSection } from "./scene-section.tsx";
import { WhoWrote } from "./who-wrote.tsx";
import { SelectionTime } from "../../timing/selection-time.tsx";
import { RundownDetails } from "../../rundown/details-rundown.tsx";

/** Where a Details section belongs: the selection, the caret's scene, the whole script, or a rundown. */
export type DetailsScope = "selection" | "scene" | "script" | "rundown";

export interface DetailsSection {
  readonly id: string;
  readonly scope: DetailsScope;
  readonly Section: ComponentType<{ docId: string }>;
}

export const DETAILS_SECTIONS: readonly DetailsSection[] = [
  { id: "layout", scope: "selection", Section: LayoutGroup },
  { id: "who_wrote", scope: "selection", Section: WhoWrote },
  { id: "scene", scope: "scene", Section: SceneSection },
  { id: "writer", scope: "scene", Section: WriterSection },
  { id: "production", scope: "script", Section: ProductionGroup },
  { id: "checks", scope: "script", Section: ChecksSection },
  { id: "timing", scope: "selection", Section: SelectionTime },
  { id: "rundown", scope: "rundown", Section: RundownDetails },
  { id: "import", scope: "script", Section: ImportSection },
];
