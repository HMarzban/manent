// Presentational sub-components for the Ink player Beside: compile badge, transcript rows, and numbered choices.
import type { InkChoice } from "@manent/formats";
import { INK_WORDS } from "@manent/ui";
import { TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { InkPlayerSnapshot, TranscriptItem } from "./controller.ts";

export function CompileBadge(props: {
  readonly state: InkPlayerSnapshot["compile"]["state"];
  readonly problemCount: number;
  readonly onOpenProblem: () => void;
}): ReactNode {
  const { state, problemCount, onOpenProblem } = props;
  if (state === "compiling") {
    return (
      <span className="text-meta text-fg-muted">{INK_WORDS.compiling}</span>
    );
  }
  if (problemCount > 0) {
    return (
      <button
        type="button"
        data-tour="ink:problems"
        onClick={onOpenProblem}
        className="inline-flex cursor-pointer items-center gap-1 rounded-control px-1.5 py-0.5 text-meta font-medium text-attention transition-colors hover:bg-subtle hover:underline"
      >
        <TriangleAlertIcon aria-hidden="true" className="size-icon shrink-0" />
        <span>{INK_WORDS.problemsCount(problemCount)}</span>
      </button>
    );
  }
  return <span className="text-meta text-fg-muted">{INK_WORDS.upToDate}</span>;
}

export function TranscriptEntry(props: {
  readonly item: TranscriptItem;
  readonly onJumpLine: (line: number) => void;
}): ReactNode {
  const { item, onJumpLine } = props;
  if (item.kind === "choice") {
    return (
      <p className="px-1.5 py-1 text-ui italic text-fg-muted">
        {INK_WORDS.takenChoice(item.text)}
      </p>
    );
  }
  if (item.line === null) {
    return <p className="px-1.5 py-0.5 text-ui text-fg">{item.text}</p>;
  }
  const line = item.line;
  const description = INK_WORDS.lineDescription(line);
  return (
    <button
      type="button"
      title={description}
      aria-description={description}
      onClick={() => onJumpLine(line)}
      className="block w-full cursor-pointer rounded-control px-1.5 py-0.5 text-start text-ui text-fg transition-colors hover:bg-subtle focus-visible:outline-2 focus-visible:outline-ring"
    >
      {item.text}
    </button>
  );
}

export function ChoicesList(props: {
  readonly choices: readonly InkChoice[];
  readonly busy: boolean;
  readonly buttonRefs: { current: (HTMLButtonElement | null)[] };
  readonly onChoose: (choice: InkChoice) => void;
}): ReactNode {
  const { choices, busy, buttonRefs, onChoose } = props;
  if (choices.length === 0) return null;
  return (
    <div
      role="group"
      aria-label={INK_WORDS.choicesLabel}
      data-tour="ink:choices"
      className="flex shrink-0 flex-col gap-1.5 border-t border-line bg-chrome p-3"
    >
      {choices.map((choice, index) => (
        <button
          key={`${choice.index}:${choice.text}`}
          ref={(el) => {
            buttonRefs.current[index] = el;
          }}
          type="button"
          disabled={busy}
          aria-label={INK_WORDS.choiceLabel(index + 1, choice.text)}
          onClick={() => onChoose(choice)}
          className="flex w-full cursor-pointer items-baseline gap-2.5 rounded-control border border-line bg-surface px-3 py-2 text-start text-ui text-fg transition-colors hover:bg-subtle focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span
            aria-hidden="true"
            className="w-4 shrink-0 text-meta font-medium text-fg-muted tabular-nums"
          >
            {index + 1}
          </span>
          <span className="min-w-0 flex-1">{choice.text}</span>
        </button>
      ))}
    </div>
  );
}
