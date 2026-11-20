// What a push may write: checked on the blocks it touched, so the cost never grows with the script.
import type { TransactionReport } from "@manent/crdt";
import { validateBlocks } from "@manent/schema";
import type { Issue } from "@manent/schema";
import { validateIndexPush } from "./index-docs.ts";
import type { Room } from "./rooms.ts";

/** Maps only the authority writes (a setting is a request, never a push). */
const AUTHORITY_MAPS = ["settings", "settingsMeta"] as const;

/**
 * The issues of severity `reject` or `newer` in the blocks the push touched, then one
 * `unknown_node` issue for each authority map it wrote. An empty list accepts the push.
 */
export function validatePush(report: TransactionReport): Issue[] {
  const issues = validateBlocks(report.touched(), {
    isIdTaken: () => false,
  }).filter(
    (issue) => issue.severity === "reject" || issue.severity === "newer",
  );
  for (const name of AUTHORITY_MAPS)
    if (report.maps.includes(name))
      issues.push({
        path: `maps.${name}`,
        code: "unknown_node",
        severity: "reject",
        message: `a push wrote the ${name} map, which only the authority writes`,
      });
  return issues;
}

/** A push judged as its room's kind is: an index by `validateIndexPush`, anything else by `validatePush`. */
export function validateRoomPush(
  report: TransactionReport,
  room: Pick<Room, "kind" | "home">,
): Issue[] {
  return room.kind === "index"
    ? validateIndexPush(report, room.home)
    : validatePush(report);
}
