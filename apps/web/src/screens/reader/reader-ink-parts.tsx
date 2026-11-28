// Presentational cards, accessible compiling skeleton, and keyboard scoping for the shared Ink reader player.
import type { InkChoice, InkProblem } from "@manent/formats";
import { INK_WORDS, READER_WORDS, Skeleton } from "@manent/ui";
import { BookOpenIcon, TriangleAlertIcon } from "lucide-react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";
import { EmptyHeroCard } from "../../empty-hero-card.tsx";
import { PlayerHeroShell } from "../../ink/player/player-parts.tsx";

const DIGIT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
const MAX_SHOWN_PROBLEMS = 5;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  )
    return true;
  if (target.closest('[role="switch"], [role="checkbox"]') !== null)
    return true;
  if (target.closest('[data-ink-variables="true"]') !== null) return true;
  return false;
}

/** Handles 1–9 choice shortcuts and ArrowUp/ArrowDown navigation scoped away from inputs and Variables drawer. */
export function handleReaderInkKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  options: {
    readonly choices: readonly InkChoice[];
    readonly disabled: boolean;
    readonly choicesContainerRef: RefObject<HTMLDivElement | null>;
    readonly transcriptRegionRef: RefObject<HTMLDivElement | null>;
    readonly choiceRefs: { current: (HTMLButtonElement | null)[] };
    readonly onChoose: (choice: InkChoice) => void;
  },
): void {
  const {
    choices,
    disabled,
    choicesContainerRef,
    transcriptRegionRef,
    choiceRefs,
    onChoose,
  } = options;
  if (isTypingTarget(event.target)) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (disabled || choices.length === 0) return;

  const digitIndex = DIGIT_KEYS.indexOf(
    event.key as (typeof DIGIT_KEYS)[number],
  );
  if (digitIndex >= 0) {
    const target = choices[digitIndex];
    if (target !== undefined) {
      event.preventDefault();
      onChoose(target);
    }
    return;
  }

  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const active = document.activeElement;
  const inChoices =
    choicesContainerRef.current !== null &&
    active instanceof Node &&
    choicesContainerRef.current.contains(active);
  const inTranscript =
    transcriptRegionRef.current !== null &&
    active instanceof Node &&
    transcriptRegionRef.current.contains(active);
  const inVariables =
    active instanceof HTMLElement &&
    active.closest('[data-ink-variables="true"]') !== null;
  if (!inChoices && (inTranscript || inVariables)) return;
  const onOtherControl =
    !inChoices &&
    active instanceof HTMLElement &&
    active !== event.currentTarget &&
    active !== document.body &&
    active.matches("button, a, input, select, textarea, [tabindex]");
  if (onOtherControl) return;

  event.preventDefault();
  const buttons = choiceRefs.current.slice(0, choices.length);
  const current = buttons.findIndex((btn) => btn === active);
  const delta = event.key === "ArrowDown" ? 1 : -1;
  const next =
    current < 0
      ? event.key === "ArrowDown"
        ? 0
        : buttons.length - 1
      : (current + delta + buttons.length) % buttons.length;
  buttons[next]?.focus();
}

export function ReaderInkLoading(): ReactNode {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-raised">
      <p role="status" className="sr-only">
        {INK_WORDS.compiling}
      </p>
      <div
        aria-busy="true"
        className="flex min-h-0 flex-1 flex-col gap-4 px-6 py-8 sm:px-8"
      >
        <div aria-hidden="true" className="flex flex-col gap-3">
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div aria-hidden="true" className="mt-4 flex flex-col gap-2">
          <Skeleton className="h-9 w-full rounded-control" />
          <Skeleton className="h-9 w-full rounded-control" />
        </div>
      </div>
    </div>
  );
}

export function ReaderInkProblemCard(props: {
  readonly problems: readonly InkProblem[];
}): ReactNode {
  const shown = props.problems.slice(0, MAX_SHOWN_PROBLEMS);
  return (
    <PlayerHeroShell>
      <div className="flex w-full max-w-md flex-col items-center gap-3">
        <EmptyHeroCard
          icon={
            <TriangleAlertIcon
              aria-hidden="true"
              className="size-5 text-attention"
            />
          }
          title={READER_WORDS.inkProblemsTitle(props.problems.length)}
          description={READER_WORDS.inkCompileProblemDetail}
        />
        {shown.length > 0 ? (
          <ul className="flex w-full flex-col gap-1.5 rounded-surface border border-line bg-well px-3.5 py-2.5 font-mono text-meta text-fg-muted">
            {shown.map((problem, index) => (
              <li key={`${problem.line}:${index}`}>
                {INK_WORDS.checkProblem(problem.line, problem.message)}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </PlayerHeroShell>
  );
}

export function ReaderInkEmptyCard(): ReactNode {
  return (
    <PlayerHeroShell>
      <EmptyHeroCard
        icon={<BookOpenIcon aria-hidden="true" className="size-5" />}
        title={INK_WORDS.emptyGameScriptTitle}
        description={READER_WORDS.inkEmptyDetail}
      />
    </PlayerHeroShell>
  );
}
