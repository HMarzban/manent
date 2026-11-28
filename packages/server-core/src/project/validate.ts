// Who may write each map of a project's index. Only a push is checked, and only who wrote, never a value's shape.
import type { ProjectIndexMap, TransactionReport } from "@manent/crdt";
import type { Issue } from "@manent/schema";
import { isWriterRole } from "../sync/admission.ts";
import type { Access } from "../sync/access.ts";

/** `owners`: the project's owners and those who may issue revisions. `editors`: those who may edit it. */
type ProjectKeyWriters = "owners" | "editors";

const PROJECT_KEY_WRITERS: Readonly<
  Record<ProjectIndexMap, ProjectKeyWriters>
> = Object.freeze({
  template: "owners",
  style: "owners",
  seasons: "editors",
  episodes: "editors",
  names: "editors",
  facts: "editors",
  groups: "owners",
  board: "editors",
  ladder: "owners",
  source: "editors",
  can_also: "owners",
  settings_meta: "owners",
});

const MAY_WRITE: Readonly<
  Record<ProjectKeyWriters, (access: Access) => boolean>
> = Object.freeze({
  owners: (access) =>
    access.role === "owner" || access.capabilities.includes("issue_revisions"),
  editors: (access) => isWriterRole(access.role),
});

const isProjectIndexMap = (name: string): name is ProjectIndexMap =>
  Object.hasOwn(PROJECT_KEY_WRITERS, name);

/**
 * One `not_index` issue for each project index map the push wrote that the pusher's access may not write. A map that
 * is not a project index map is left to the index's own check. An empty list accepts the push.
 */
export function validateProjectIndexWrites(
  report: TransactionReport,
  access: Access,
): Issue[] {
  return report.maps
    .filter(isProjectIndexMap)
    .filter((name) => !MAY_WRITE[PROJECT_KEY_WRITERS[name]](access))
    .map((name) => ({
      path: `maps.${name}`,
      code: "not_index",
      severity: "reject",
      message: `a push wrote the ${name} map, which a person of role ${access.role} may not write`,
    }));
}
