// Index documents: the kinds that hold a person's, a workspace's or a project's maps, and what a push to one may write.
import {
  PRIVATE_INDEX_MAPS,
  PROJECT_INDEX_MAPS,
  WORKSPACE_INDEX_MAPS,
} from "@manent/crdt";
import type { TransactionReport } from "@manent/crdt";
import type { Issue } from "@manent/schema";
import type { Home } from "@manent/storage";
import { indexDocId } from "@manent/sync-protocol";
import type { DocKind } from "@manent/sync-protocol";
import { validateProjectIndexWrites } from "../project/validate.ts";
import type { Access } from "./access.ts";

/** The kinds that hold maps and never a script body. */
export const INDEX_KINDS: readonly DocKind[] = Object.freeze(["index"]);

/** Whose maps an index holds: a person's, a workspace's or a project's. */
type IndexScope = "user" | "workspace" | "project";

/** Maps an index of `scope` may hold. */
export interface IndexKeyRule {
  scope: IndexScope;
  maps: readonly string[];
}

/** An index holds the maps of every rule of its scope; append a rule on its own line. */
export const INDEX_KEY_RULES: readonly IndexKeyRule[] = Object.freeze([
  { scope: "user", maps: PRIVATE_INDEX_MAPS },
  { scope: "workspace", maps: WORKSPACE_INDEX_MAPS },
  { scope: "project", maps: PROJECT_INDEX_MAPS },
]);

/**
 * A person's index is the one in their own file; a workspace's is the project home of its own id; a project's is
 * the one whose id is the project's index id, in that project's home. Null: none of these.
 */
function scopeOf(index: { docId: string; home: Home }): IndexScope | null {
  const { docId, home } = index;
  if (home.kind === "user") return "user";
  if (docId === indexDocId("project", home.id)) return "project";
  return home.id === docId ? "workspace" : null;
}

const notIndex = (path: string, message: string): Issue => ({
  path,
  code: "not_index",
  severity: "reject",
  message,
});

/**
 * One `not_index` issue for each map the push wrote that no rule of the index's scope holds, then
 * one for a script body it touched, then, on a project's index, one for each map the pusher's
 * `access` may not write. An empty list accepts the push.
 */
export function validateIndexPush(
  report: TransactionReport,
  index: { docId: string; home: Home },
  access: Access,
): Issue[] {
  const scope = scopeOf(index);
  const held = INDEX_KEY_RULES.filter((rule) => rule.scope === scope).flatMap(
    (rule) => rule.maps,
  );
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
  if (scope === "project")
    issues.push(...validateProjectIndexWrites(report, access));
  return issues;
}
