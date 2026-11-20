// Index documents: the kinds that hold a person's or a workspace's maps, and what a push to one may write.
import { PRIVATE_INDEX_MAPS, WORKSPACE_INDEX_MAPS } from "@manent/crdt";
import type { TransactionReport } from "@manent/crdt";
import type { Issue } from "@manent/schema";
import type { Home } from "@manent/storage";
import type { DocKind } from "@manent/sync-protocol";

/** The kinds that hold maps and never a script body. */
export const INDEX_KINDS: readonly DocKind[] = Object.freeze(["index"]);

const MAPS_OF: Readonly<Record<Home["kind"], readonly string[]>> = {
  user: PRIVATE_INDEX_MAPS,
  project: WORKSPACE_INDEX_MAPS,
};

const notIndex = (path: string, message: string): Issue => ({
  path,
  code: "not_index",
  severity: "reject",
  message,
});

/**
 * One `not_index` issue for each map the push wrote that an index in `home` does not hold (a
 * person's maps in a `user` home, a workspace's in a `project` home), then one for a script body
 * it touched. An empty list accepts the push.
 */
export function validateIndexPush(
  report: TransactionReport,
  home: Home,
): Issue[] {
  const held = MAPS_OF[home.kind];
  const issues = report.maps
    .filter((name) => !held.includes(name))
    .map((name) =>
      notIndex(
        `maps.${name}`,
        `a push wrote the ${name} map, which this index does not hold`,
      ),
    );
  const body =
    report.inserted.length > 0 ||
    report.changed.length > 0 ||
    report.removed.length > 0 ||
    report.touched().length > 0;
  if (body)
    issues.push(notIndex("body", "a push wrote a script body into an index"));
  return issues;
}
