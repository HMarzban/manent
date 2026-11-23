// What a push may write: checked on the blocks it touched, so the cost never grows with the script.
import type { TransactionReport } from "@manent/crdt";
import { validateBlocks } from "@manent/schema";
import type { Issue } from "@manent/schema";
import type { DocKind } from "@manent/sync-protocol";
import { validateCommentsPush } from "../comments/validate.ts";
import { validateRundownPush } from "../rundown/validate.ts";
import { validateIndexPush } from "./index-docs.ts";
import type { Room, Subscription } from "./rooms.ts";

/** Maps only the authority writes (a setting is a request, never a push). */
const AUTHORITY_MAPS = ["settings", "settingsMeta"] as const;

/**
 * The issues of severity `reject` or `newer` in the blocks the push touched, then one
 * `unknown_node` issue for each authority map it wrote. An empty list accepts the push.
 */
export function validatePush(report: TransactionReport): Issue[] {
  // a held ID is a `repair` issue, which this step drops: the write path's step 6 repairs copies
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

/** A push to be judged: what it changed, its room, and the subscription it came through, which names the pusher and their access. */
export interface Push {
  report: TransactionReport;
  room: Room;
  subscription: Subscription;
}

/** The issues of a push to a document of one kind; an empty list accepts it. */
export type PushValidator = (push: Push) => Issue[];

/** The kinds not judged as a script; a kind without a line keeps `validatePush`. */
export const PUSH_VALIDATORS: Readonly<
  Partial<Record<DocKind, PushValidator>>
> = Object.freeze({
  index: ({ report, room }) => validateIndexPush(report, room),
  comments: validateCommentsPush,
  rundown: validateRundownPush,
});

/** A push judged as its room's kind is. */
export function validateRoomPush(push: Push): Issue[] {
  const validator = PUSH_VALIDATORS[push.room.kind];
  return validator === undefined ? validatePush(push.report) : validator(push);
}
