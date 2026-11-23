// The Details tab's sections, one line per section, each in its scope.
import type { ComponentType } from "react";
import { ImportSection } from "../../import/import-section.tsx";
import { ProductionGroup } from "../../production/production-group.tsx";
import { LayoutGroup } from "./layout-group.tsx";
import { SceneSection } from "./scene-section.tsx";
import { WhoWrote } from "./who-wrote.tsx";

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
  { id: "production", scope: "script", Section: ProductionGroup },
  { id: "import", scope: "script", Section: ImportSection },
];
