// The Details tab's sections, one line per section, each in its scope.
import type { ComponentType } from "react";

export interface DetailsSection {
  readonly id: string;
  readonly scope: "selection" | "scene" | "script";
  readonly Section: ComponentType<{ docId: string }>;
}

export const DETAILS_SECTIONS: readonly DetailsSection[] = [];
