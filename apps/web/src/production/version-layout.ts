// How a version kept in production is laid out: its scene numbers derived and its omitted scenes hidden, as then.
import type { LayoutPatches } from "@manent/pagination";
import {
  NUMBERING_SCHEMES,
  deriveNumbers,
  productionLayout,
} from "@manent/revisions";
import { blocksOf, sectionize } from "@manent/schema";
import type { VersionContent } from "@manent/sync-protocol";

const isHeading = (type: unknown): boolean =>
  type === "scene_heading" || type === "slug";

/** Null for a version kept before page numbers were locked. */
export const productionVersionLayout: (
  content: VersionContent,
) => LayoutPatches | null = (content) => {
  if (content.locks === null) return null;
  const flat = blocksOf(sectionize(content.blocks));
  const headings = flat.flatMap(({ attrs }) =>
    isHeading(attrs.type) && attrs.id !== null
      ? [{ blockId: attrs.id, num: attrs.num }]
      : [],
  );
  const used = new Set(
    flat.flatMap(({ attrs }) => (attrs.num === null ? [] : [attrs.num])),
  );
  const numbering =
    NUMBERING_SCHEMES.find(
      (scheme) => scheme === content.settings["script.numbering"],
    ) ?? "suffix";
  return productionLayout(flat, deriveNumbers(headings, numbering, used));
};
