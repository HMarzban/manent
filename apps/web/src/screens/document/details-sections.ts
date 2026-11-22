// The Details tab's sections, one line per section, each in its scope.
import type { ComponentType } from "react";
import { ImportSection } from "../../import/import-section.tsx";
import { ProductionGroup } from "../../production/production-group.tsx";
import { LayoutGroup } from "./layout-group.tsx";
import { WhoWrote } from "./who-wrote.tsx";

export interface DetailsSection {
  readonly id: string;
  readonly scope: "selection" | "scene" | "script";
  readonly Section: ComponentType<{ docId: string }>;
}

export const DETAILS_SECTIONS: readonly DetailsSection[] = [
  { id: "layout", scope: "selection", Section: LayoutGroup },
  { id: "who_wrote", scope: "selection", Section: WhoWrote },
  { id: "production", scope: "script", Section: ProductionGroup },
  { id: "import", scope: "script", Section: ImportSection },
];
