// What a push may write: checked on the blocks it touched, so the cost never grows with the script.
import type { TransactionReport } from "@manent/crdt";
import { validateBlocks } from "@manent/schema";
import type { Issue } from "@manent/schema";

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
