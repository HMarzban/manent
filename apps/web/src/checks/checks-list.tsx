// The one list of checks that Details and every Send form draw: each sentence after its mark, with the check's action
// when it offers one, or the sentence saying nothing needs a look.
import { Button, CHECKS_WORDS } from "@manent/ui";
import type { ReactNode } from "react";
import { CheckMark } from "../send/check-mark.tsx";
import { CHECK_SOURCES } from "./sources.ts";
import type { Check } from "./sources.ts";

export interface FoundCheck extends Check {
  /** Unique across every source. */
  readonly key: string;
}

/** What every source finds in `docId` now, in the order of CHECK_SOURCES. It walks the script: never on a keystroke. */
export function findChecks(docId: string): readonly FoundCheck[] {
  return CHECK_SOURCES.flatMap((source) =>
    source
      .find(docId)
      .map((check) => ({ ...check, key: `${source.id}:${check.id}` })),
  );
}

export function ChecksList(props: {
  checks: readonly FoundCheck[];
}): ReactNode {
  const { checks } = props;
  if (checks.length === 0)
    return <p className="text-ui text-fg-muted">{CHECKS_WORDS.nothing}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {checks.map(({ key, sentence, action }) => (
        <li key={key} className="flex items-start gap-2">
          <CheckMark ok={false} />
          <span className="min-w-0 flex-1">{sentence}</span>
          {action === null ? null : (
            <Button variant="outline" size="sm" onClick={action.run}>
              {action.label}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
