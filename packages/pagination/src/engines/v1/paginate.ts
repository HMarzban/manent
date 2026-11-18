// A whole script's pages, from its layout blocks and its page profile.
import type { LayoutBlock } from "../../layout-block.ts";
import { NO_LOCKS } from "../../lock-table.ts";
import type { LockTable } from "../../lock-table.ts";
import type { PageProfile } from "../../page-profile.ts";
import type { Page, Pagination } from "../../pages.ts";
import { fillPage, firstStart, hasSpeakerSuffix } from "./fill.ts";
import type { FilledPage, PageStart } from "./fill.ts";
import { createFlow } from "./keep.ts";
import type { Flow } from "./keep.ts";
import { measure } from "./measure.ts";

function fillFrom(flow: Flow, start: PageStart): FilledPage[] {
  const pages: FilledPage[] = [];
  for (let at: PageStart | null = start; at !== null;) {
    const { page, next } = fillPage(flow, at);
    pages.push(page);
    at = next;
  }
  return pages;
}

function numbered(pages: readonly FilledPage[]): Page[] {
  return pages.map((page, index) =>
    Object.freeze({ ...page, index, label: String(index + 1) }),
  );
}

/** The pages of `blocks`, each block measured once; the result keeps what it measured in `metrics`. */
export function paginate(
  blocks: readonly LayoutBlock[],
  profile: PageProfile,
  locks: LockTable = NO_LOCKS,
): Pagination {
  const own = Object.freeze([...blocks]);
  const metrics = Object.freeze(
    own.map((block, i) =>
      measure(block, profile, {
        suffix: hasSpeakerSuffix(own, profile, i)
          ? profile.furniture.contdText
          : "",
      }),
    ),
  );
  const flow = createFlow(own, profile, metrics);
  return Object.freeze({
    engineVersion: profile.engineVersion,
    profile,
    locks,
    blocks: own,
    metrics,
    pages: Object.freeze(numbered(fillFrom(flow, firstStart(flow)))),
  });
}
