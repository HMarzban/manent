// Earlier drafts as deterministic changes to the generated parts of the final one, and the sessions between two.
import type { SeedBlock } from "../content/markup.ts";
import type { Rng } from "../seed/rng.ts";
import type { PageMeter, SeedLayout } from "./fit.ts";
import type { StyleGuide } from "./guide.ts";

/** `name` null: a session, not a named draft. */
export interface DraftTarget {
  name: string | null;
  pages: number;
}

export type BlockChange =
  | { op: "insert"; at: number; block: SeedBlock }
  | { op: "replace"; at: number; block: SeedBlock }
  | { op: "delete"; at: number };

/** Oldest first; the last equals `final`. */
export async function deriveDrafts(
  _final: readonly SeedBlock[],
  _targets: readonly DraftTarget[],
  _options: {
    fixed: ReadonlySet<number>;
    guide: StyleGuide;
    rng: Rng;
    meter: PageMeter;
    layout: SeedLayout;
  },
): Promise<SeedBlock[][]> {
  return [];
}

/** `count` slices, in document order. */
export function sessionsBetween(
  _older: readonly SeedBlock[],
  _newer: readonly SeedBlock[],
  _count: number,
): BlockChange[][] {
  return [];
}
