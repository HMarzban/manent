// A whole script's pages, from its layout blocks and its page profile.
import type { LayoutBlock } from "../../layout-block.ts";
import { NO_LOCKS } from "../../lock-table.ts";
import type { LockTable } from "../../lock-table.ts";
import type { PageProfile } from "../../page-profile.ts";
import type { BlockMetrics, Pagination } from "../../pages.ts";
import { fillPage, firstStart, hasSpeakerSuffix, labelPages } from "./fill.ts";
import type { FilledPage, PageStart } from "./fill.ts";
import { createFlow } from "./keep.ts";
import type { Flow, LockedLine } from "./keep.ts";
import { planLocks } from "./locks.ts";
import type { LockedStart } from "./locks.ts";
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

// The line of each lock start, by block; a start inside a block was measured as a forced line start.
function lockedLines(
  starts: readonly LockedStart[],
  metrics: readonly BlockMetrics[],
): Map<number, LockedLine[]> {
  const locked = new Map<number, LockedLine[]>();
  for (const { block, offset, label } of starts) {
    const lineStarts = metrics[block]!.starts;
    let line = 0;
    while (line + 1 < lineStarts.length && lineStarts[line + 1]! <= offset)
      line++;
    locked.set(block, [...(locked.get(block) ?? []), { line, label }]);
  }
  return locked;
}

/** The pages of `blocks`, each block measured once; the result keeps what it measured in `metrics`. */
export function paginate(
  blocks: readonly LayoutBlock[],
  profile: PageProfile,
  locks: LockTable = NO_LOCKS,
): Pagination {
  const own = Object.freeze([...blocks]);
  const plan = planLocks(own, profile, locks);
  const forced = new Map<number, number[]>();
  for (const { block, offset } of plan.starts)
    if (offset > 0) forced.set(block, [...(forced.get(block) ?? []), offset]);
  const metrics = Object.freeze(
    own.map((block, i) =>
      measure(block, profile, {
        suffix: hasSpeakerSuffix(own, profile, i)
          ? profile.furniture.contdText
          : "",
        forced: forced.get(i) ?? [],
      }),
    ),
  );
  const flow = createFlow(
    own,
    profile,
    metrics,
    lockedLines(plan.starts, metrics),
  );
  return Object.freeze({
    engineVersion: profile.engineVersion,
    profile,
    locks,
    blocks: own,
    metrics,
    pages: Object.freeze(
      labelPages(flow, fillFrom(flow, firstStart(flow)), plan.taken),
    ),
  });
}
