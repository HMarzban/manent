// The file a revision is issued as: the script laid out as production shows it, its revised pages
// headed, marked and tinted as asked.
import { applyLayoutPatches } from "@manent/pagination";
import type {
  Engine,
  LockAnchorRecord,
  PageProfile,
  Pagination,
} from "@manent/pagination";
import {
  lockedPagination,
  pageRevision,
  paperRgb,
  productionLayout,
} from "@manent/revisions";
import type { RevisionSource } from "@manent/revisions";
import { blocksOf, sectionize } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import type { ScriptFontFiles } from "../pdf/fonts.ts";
import { writePdf } from "../pdf/write.ts";

// What the packet reads of a version's content; the wire's version content is one.
interface VersionContent {
  /** In document order, without their sections. */
  readonly blocks: readonly BlockJSON[];
}

export interface PacketInput {
  content: VersionContent;
  profile: PageProfile;
  engine: Engine;
  anchors: readonly LockAnchorRecord[];
  /** Derived scene numbers, by heading id. */
  numbers: ReadonlyMap<string, string>;
  /** Oldest first, the active one last. */
  sources: readonly RevisionSource[];
  /** The chosen labels in page order; null for every page. */
  pages: readonly string[] | null;
  /** Whether revised lines carry their revision's mark. */
  marked: boolean;
  /** Whether a revised page is drawn on its revision's paper. */
  tint: boolean;
}

/** The pages the screen shows for this content: its locks held, omitted scenes taking no room. */
export function packetPagination(input: PacketInput): Pagination {
  const flat = blocksOf(sectionize(input.content.blocks));
  const blocks = applyLayoutPatches(
    input.engine.toLayoutBlocks(flat),
    productionLayout(flat, input.numbers),
  );
  return lockedPagination(blocks, input.profile, input.anchors, input.engine)
    .pagination;
}

function pageIndexes(p: Pagination, labels: readonly string[]): number[] {
  return labels.map((label) => {
    const index = p.pages.findIndex((page) => page.label === label);
    if (index < 0)
      throw new RangeError(
        `a packet's page must be a label it prints, not ${label}`,
      );
    return index;
  });
}

/**
 * The packet as a PDF. Every page a source revised carries that source's header; its marks only
 * when `marked`, its paper only when `tint`. Throws RangeError for a chosen label no page prints.
 */
export async function writePacket(
  input: PacketInput,
  fonts: ScriptFontFiles,
): Promise<Uint8Array> {
  const p = packetPagination(input);
  return await writePdf(p, {
    fonts,
    ...(input.pages === null ? {} : { pages: pageIndexes(p, input.pages) }),
    decor: (pageIndex) => {
      const revision = pageRevision(p, pageIndex, input.sources, "collated");
      if (revision === null) return null;
      return {
        header: revision.header,
        marks: input.marked ? revision.marks : [],
        tint: input.tint ? paperRgb(revision.colour) : null,
      };
    },
  });
}
