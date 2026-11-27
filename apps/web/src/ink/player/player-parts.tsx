// Presentational sub-components for the Ink player Beside: compile badge, empty/recovery cards, fault alert, transcript rows, and choices.
import type { InkChoice, InkFault } from "@manent/formats";
import { Button, INK_WORDS } from "@manent/ui";
import { CircleAlertIcon, PlayIcon, TriangleAlertIcon } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { EmptyHeroCard } from "../../empty-hero-card.tsx";
import type { InkPlayerSnapshot, TranscriptItem } from "./controller.ts";

export function CompileBadge(props: {
  readonly state: InkPlayerSnapshot["compile"]["state"];
  readonly problemCount: number;
  readonly onOpenProblem: () => void;
}): ReactNode {
  const { state, problemCount, onOpenProblem } = props;
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center">
      {state === "stopped" ? (
        <span className="text-meta font-medium text-attention">
          {INK_WORDS.playerStoppedTitle}
        </span>
      ) : state === "compiling" ? (
        <span className="text-meta text-fg-muted">{INK_WORDS.compiling}</span>
      ) : problemCount > 0 ? (
        <button
          type="button"
          data-tour="ink:problems"
          onClick={onOpenProblem}
          className="inline-flex cursor-pointer items-center gap-1 rounded-control px-1.5 py-0.5 text-meta font-medium text-attention transition-colors hover:bg-subtle hover:underline"
        >
          <TriangleAlertIcon
            aria-hidden="true"
            className="size-icon shrink-0"
          />
          <span>{INK_WORDS.problemsCount(problemCount)}</span>
        </button>
      ) : (
        <span className="text-meta text-fg-muted">{INK_WORDS.upToDate}</span>
      )}
    </span>
  );
}

export function PlayerHeroShell(props: {
  readonly children: ReactNode;
}): ReactNode {
  return (
    <div className="flex min-h-0 flex-1 overflow-y-auto p-6">
      <div className="flex min-h-full w-full flex-col items-center justify-center">
        {props.children}
      </div>
    </div>
  );
}

export function WorkerStoppedCard(props: {
  readonly busy: boolean;
  readonly onRestartWorker: () => void;
}): ReactNode {
  return (
    <PlayerHeroShell>
      <EmptyHeroCard
        compact
        icon={
          <CircleAlertIcon
            aria-hidden="true"
            className="size-4 text-attention"
          />
        }
        title={INK_WORDS.playerStoppedTitle}
        description={INK_WORDS.playerStoppedDetail}
        descriptionRole="alert"
        actions={
          <Button
            variant="default"
            size="sm"
            disabled={props.busy}
            className={props.busy ? "cursor-not-allowed" : "cursor-pointer"}
            onClick={props.onRestartWorker}
          >
            {INK_WORDS.restartPlayer}
          </Button>
        }
      />
    </PlayerHeroShell>
  );
}

export function NothingCompiledCard(props: {
  readonly problemCount: number;
  readonly onOpenProblem: () => void;
}): ReactNode {
  return (
    <PlayerHeroShell>
      <EmptyHeroCard
        compact
        icon={
          <TriangleAlertIcon
            aria-hidden="true"
            className="size-4 text-attention"
          />
        }
        title={INK_WORDS.problemsCount(props.problemCount)}
        description={INK_WORDS.nothingCompiled}
        actions={
          <Button
            variant="outline"
            size="sm"
            data-tour="ink:problems"
            className="cursor-pointer"
            onClick={props.onOpenProblem}
          >
            {INK_WORDS.seeLine}
          </Button>
        }
      />
    </PlayerHeroShell>
  );
}

export function PlayerReadyCard(props: {
  readonly onPlay: () => void;
}): ReactNode {
  return (
    <PlayerHeroShell>
      <EmptyHeroCard
        compact
        icon={<PlayIcon aria-hidden="true" className="size-4" />}
        title={INK_WORDS.playerReadyTitle}
        description={INK_WORDS.pressPlay}
        actions={
          <Button
            variant="default"
            size="sm"
            data-tour="ink:play"
            className="cursor-pointer"
            onClick={props.onPlay}
          >
            {INK_WORDS.play}
          </Button>
        }
      />
    </PlayerHeroShell>
  );
}

export function StoryFaultAlert(props: {
  readonly fault: InkFault;
  readonly alertRef: RefObject<HTMLDivElement | null>;
  readonly onJumpLine: (line: number) => void;
}): ReactNode {
  const { fault, alertRef, onJumpLine } = props;
  return (
    <div
      ref={alertRef}
      role="alert"
      tabIndex={-1}
      className="mt-2 flex flex-col gap-1 rounded-control border border-line bg-subtle px-3 py-2 text-ui text-fg focus:outline-none focus-visible:outline-2 focus-visible:outline-ring"
    >
      <p className="flex items-center gap-1.5 font-medium">
        <TriangleAlertIcon
          aria-hidden="true"
          className="size-icon shrink-0 text-attention"
        />
        {fault.line === null ? (
          <span>{INK_WORDS.stoppedWithoutLine}</span>
        ) : (
          <span>
            {INK_WORDS.stoppedAtPrefix}{" "}
            <button
              type="button"
              onClick={() => onJumpLine(fault.line!)}
              className="cursor-pointer underline hover:text-fg-accent"
            >
              {INK_WORDS.lineLink(fault.line)}
            </button>
            {"."}
          </span>
        )}
      </p>
      <p className="font-mono text-meta text-fg-muted">{fault.message}</p>
    </div>
  );
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
  readonly containerRef?: RefObject<HTMLDivElement | null>;
  readonly buttonRefs: { current: (HTMLButtonElement | null)[] };
  readonly onChoose: (choice: InkChoice) => void;
}): ReactNode {
  const { choices, busy, containerRef, buttonRefs, onChoose } = props;
  if (choices.length === 0) return null;
  return (
    <div
      ref={containerRef}
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
          className="flex w-full cursor-pointer items-baseline gap-2.5 rounded-control border border-line bg-raised px-3 py-2 text-start text-ui text-fg transition-colors hover:bg-subtle focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
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
