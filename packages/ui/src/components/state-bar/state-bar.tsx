// The bar under the title bar that says what state the document is in (left) and what mode you are in (right).
import { cn } from "cn";
import { TriangleExclamationPointIcon } from "lucide-react";
import type { ReactNode } from "react";
import { DOCUMENT_WORDS } from "../../words/document.ts";
import { CloseButton } from "../panel-tabs/close-button.tsx";
import { Button } from "../stock/button.tsx";
import type { StateLine } from "./state-line.ts";

const ACTION_LIMIT = 2;
const ACTION_VARIANTS = ["outline", "ghost"] as const;

interface StateBarProps {
  left: StateLine | null;
  right: StateLine | null;
  run(id: string): void;
  registered(commandId: string): boolean;
}

interface SideProps {
  line: StateLine | null;
  run(id: string): void;
  registered(commandId: string): boolean;
}

function StateSide({ line, run, registered }: SideProps): ReactNode {
  // an empty side keeps the other side in its place
  if (line === null) return <div />;
  if (line.actions.length > ACTION_LIMIT) {
    throw new RangeError(
      `a side of the state bar holds at most two actions, not ${line.actions.length}`,
    );
  }
  const { dismiss } = line;
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2",
        line.attention && "text-attention",
      )}
    >
      {line.attention ? (
        <TriangleExclamationPointIcon aria-hidden="true" />
      ) : null}
      {line.chip === null ? null : (
        <span data-rev={line.chip} aria-hidden="true" className="mn-rev-chip" />
      )}
      <span className="truncate">{line.sentence}</span>
      {line.actions
        .filter((action) => registered(action.commandId))
        .map((action, index) => (
          <Button
            key={action.commandId}
            variant={ACTION_VARIANTS[index]}
            size="sm"
            onClick={() => run(action.commandId)}
          >
            {action.label}
          </Button>
        ))}
      {dismiss !== null && registered(dismiss) ? (
        <CloseButton
          label={DOCUMENT_WORDS.dismiss}
          onClick={() => run(dismiss)}
        />
      ) : null}
    </div>
  );
}

/** Absent from the page while neither side has a line; a polite live region while it has one. */
export function StateBar({
  left,
  right,
  run,
  registered,
}: StateBarProps): ReactNode {
  if (left === null && right === null) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-tour="state_bar"
      className="flex h-statebar items-center justify-between gap-4 border-b border-line bg-chrome px-3 text-ui"
    >
      <StateSide line={left} run={run} registered={registered} />
      <StateSide line={right} run={run} registered={registered} />
    </div>
  );
}
