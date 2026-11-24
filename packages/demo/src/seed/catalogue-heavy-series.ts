// Documents Heavy's series seed adds beyond HEAVY_DOCS: Ward Nine's upcoming Season 5 outlines.
import { seedDocId } from "@manent/sync-protocol";
import type { SeedDoc } from "./catalogue.ts";

const outline = (suffix: string, title: string): SeedDoc => {
  const key = `heavy/h24/${suffix}`;
  return {
    key,
    projectKey: "heavy/h24",
    title,
    kind: "outline",
    format: "screenplay",
    docId: seedDocId(key),
    hero: false,
  };
};

export const HEAVY_SERIES_DOCS: readonly SeedDoc[] = Object.freeze([
  outline("501", "501 Night Shift"),
  outline("502", "502 Relief Cover"),
  outline("503", "503 Triage"),
]);
