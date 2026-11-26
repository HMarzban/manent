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
const OVER_MARKER = " · Over ";

function renderSentence(line: StateLine): ReactNode {
  if (line.attention) return line.sentence;
  const overAt = line.sentence.indexOf(OVER_MARKER);
  if (overAt === -1) return line.sentence;
  const splitAt = overAt + 3;
  return (
    <>
      {line.sentence.slice(0, splitAt)}
      <span className="font-medium text-attention">
        {line.sentence.slice(splitAt)}
      </span>
    </>
  );
}

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
        <TriangleExclamationPointIcon aria-hidden="true" className="shrink-0" />
      ) : null}
      {line.chip === null ? null : (
        <span data-rev={line.chip} aria-hidden="true" className="mn-rev-chip" />
      )}
      <span
        className="max-sm:whitespace-normal sm:truncate"
        title={line.sentence}
      >
        {renderSentence(line)}
      </span>
      {line.actions
        .filter((action) => registered(action.commandId))
        .map((action, index) => (
          <Button
            key={action.commandId}
            variant={ACTION_VARIANTS[index]}
            size="sm"
            className="text-fg"
            data-tour={action.tourTarget ?? action.commandId}
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
  const soloRightAsLeft =
    left === null &&
    right !== null &&
    right.actions.length === 0 &&
    right.dismiss === null;
  const shownLeft = soloRightAsLeft ? right : left;
  const shownRight = soloRightAsLeft ? null : right;
  return (
    <div
      role="status"
      aria-live="polite"
      data-tour="state_bar"
      className="flex min-h-statebar flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line bg-chrome px-3 py-1 text-ui animate-in fade-in-0 duration-(--dur-fast) ease-out"
    >
      <StateSide line={shownLeft} run={run} registered={registered} />
      <StateSide line={shownRight} run={run} registered={registered} />
    </div>
  );
}
