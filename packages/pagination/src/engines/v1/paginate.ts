// A whole script's pages, from its layout blocks and its page profile.
import type { LayoutBlock } from "../../layout-block.ts";
import { NO_LOCKS } from "../../lock-table.ts";
import type { LockTable } from "../../lock-table.ts";
import type { PageProfile } from "../../page-profile.ts";
import type { Pagination } from "../../pages.ts";
import { fillPage, firstStart, measureAt, pageLabels } from "./fill.ts";
import type { FilledPage } from "./fill.ts";
import { createFlow } from "./keep.ts";
import { forcedOffsets, lockedLines, planLocks } from "./locks.ts";

/** The pages of `blocks`, each block measured once; the result keeps what it measured in `metrics`. */
export function paginate(
  blocks: readonly LayoutBlock[],
  profile: PageProfile,
  locks: LockTable = NO_LOCKS,
): Pagination {
  const own = Object.freeze([...blocks]);
  const plan = planLocks(own, profile, locks);
  const forced = forcedOffsets(plan.starts);
  const metrics = Object.freeze(
    own.map((_, i) => measureAt(own, profile, i, forced.get(i) ?? [])),
  );
  const flow = createFlow(
    own,
    profile,
    metrics,
    lockedLines(plan.starts, metrics),
  );
  const filled: FilledPage[] = [];
  for (let at = firstStart(flow); ;) {
    const { page, next } = fillPage(flow, at);
    filled.push(page);
    if (next === null) break;
    at = next;
  }
  const labels = pageLabels(flow, filled, plan.taken);
  return Object.freeze({
    engineVersion: profile.engineVersion,
    profile,
    locks,
    blocks: own,
    metrics,
    pages: Object.freeze(
      filled.map((page, index) =>
        Object.freeze({ ...page, index, label: labels[index]! }),
      ),
    ),
  });
}
