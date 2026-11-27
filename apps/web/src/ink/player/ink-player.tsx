// Ink player Beside: header bar, collapsible Variables drawer, passage transcript, choices, and keyboard controls.
import { Button, INK_WORDS } from "@manent/ui";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type { BesideKind } from "../../beside/kinds.ts";
import { useDocumentTitle } from "../../screens/document/title-bar.tsx";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { createInkPlayerController } from "./controller.ts";
import type { InkPlayerController } from "./controller.ts";
import {
  ChoicesList,
  CompileBadge,
  NothingCompiledCard,
  PlayerReadyCard,
  StoryFaultAlert,
  TranscriptEntry,
  WorkerStoppedCard,
} from "./player-parts.tsx";
import { jumpToInkLine } from "./source-nav.ts";
import { createInkPlaythroughStore } from "./storage.ts";
import type { InkPlaythroughStore } from "./storage.ts";
import { VariablesDrawer } from "./variables-drawer.tsx";

const DIGIT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
const noopUnsub = (): (() => void) => () => {};
const readNull = (): null => null;

interface PlayerRuntime {
  readonly ctrl: InkPlayerController;
  readonly store: InkPlaythroughStore;
}

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

/** Beside body for an Ink script: interactive playthrough with replay, variables, and source links. */
export function InkPlayerBeside(props: {
  docId: string;
  at: { blockId: string } | null;
}): ReactNode {
  const { docId } = props;
  const { userId, editor } = useServices();
  const { storage, storageEvents, now } = useEnvironment();
  const [varsOpen, setVarsOpen] = useState(false);
  const varsDrawerId = useId();
  const choicesContainerRef = useRef<HTMLDivElement | null>(null);
  const transcriptRegionRef = useRef<HTMLDivElement | null>(null);
  const choiceRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const faultRef = useRef<HTMLDivElement | null>(null);
  const restartEndRef = useRef<HTMLButtonElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const [controller, setController] = useState<PlayerRuntime | null>(null);

  useEffect(() => {
    const store = createInkPlaythroughStore({
      storage,
      events: storageEvents,
      userId,
    });
    const ctrl = createInkPlayerController({ docId, store, now });
    const runtime: PlayerRuntime = { ctrl, store };
    setController(runtime);
    return () => {
      ctrl.dispose();
      store.dispose();
      setController((current) => (current === runtime ? null : current));
    };
  }, [docId, storage, storageEvents, userId, now]);

  const snap = useSyncExternalStore(
    controller?.ctrl.subscribe ?? noopUnsub,
    controller?.ctrl.snapshot ?? readNull,
    controller?.ctrl.snapshot ?? readNull,
  );

  useEffect(() => {
    if (snap === null || snap.workerStopped) return;
    if (snap.fault !== null && snap.choices.length === 0) {
      transcriptEndRef.current?.scrollIntoView?.({ block: "nearest" });
      faultRef.current?.focus();
      return;
    }
    if (snap.focusNonce === 0) return;
    transcriptEndRef.current?.scrollIntoView?.({ block: "nearest" });
    if (snap.choices.length > 0) {
      choiceRefs.current[0]?.focus();
    } else if (snap.ended) {
      restartEndRef.current?.focus();
    }
  }, [
    snap?.focusNonce,
    snap?.choices.length,
    snap?.ended,
    snap?.fault,
    snap?.workerStopped,
  ]);

  if (controller === null || snap === null) return null;

  const jumpLine = (line: number): void => {
    void jumpToInkLine(docId, line, editor);
  };
  const firstProblemLine = snap.compile.problems[0]?.line ?? null;
  const openFirstProblem = (): void => {
    if (firstProblemLine !== null) jumpLine(firstProblemLine);
  };

  const canBack =
    snap.started &&
    !snap.workerStopped &&
    snap.recordedChoices.length > 0 &&
    !snap.busy;
  const canRestart =
    snap.started &&
    !snap.workerStopped &&
    !snap.busy &&
    (snap.recordedChoices.length > 0 ||
      snap.editedVariables.length > 0 ||
      snap.ended ||
      snap.fault !== null ||
      snap.startKnot !== null);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (isTypingTarget(event.target)) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (snap.workerStopped || snap.choices.length === 0 || snap.busy) return;
    const digitIndex = DIGIT_KEYS.indexOf(
      event.key as (typeof DIGIT_KEYS)[number],
    );
    if (digitIndex >= 0) {
      const target = snap.choices[digitIndex];
      if (target !== undefined) {
        event.preventDefault();
        controller.ctrl.choose(target);
      }
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
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
      const buttons = choiceRefs.current.slice(0, snap.choices.length);
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
  };

  const nothingCompiled =
    snap.compile.lastGood === null && snap.compile.problems.length > 0;
  const playingLastGood =
    !snap.workerStopped &&
    snap.compile.lastGood !== null &&
    snap.compile.problems.length > 0;

  return (
    <div
      data-tour="ink:player"
      onKeyDown={onKeyDown}
      className="flex min-h-0 flex-1 flex-col bg-chrome text-fg"
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-line bg-chrome px-3 py-2 text-ui">
        {snap.place === null ? null : (
          <span className="truncate font-mono text-meta font-medium text-fg">
            {INK_WORDS.place(snap.place.knot, snap.place.stitch)}
          </span>
        )}
        <CompileBadge
          state={snap.compile.state}
          problemCount={snap.compile.problems.length}
          onOpenProblem={openFirstProblem}
        />
        {snap.editedVariables.length > 0 ? (
          <span className="mn-tag">{INK_WORDS.variablesEdited}</span>
        ) : null}
        <div className="ms-auto flex items-center gap-1.5">
          {snap.variables.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={varsOpen}
              aria-controls={varsDrawerId}
              className="cursor-pointer gap-1 text-meta text-fg-muted hover:text-fg"
              onClick={() => setVarsOpen((open) => !open)}
            >
              {varsOpen ? (
                <ChevronDownIcon aria-hidden="true" className="size-icon" />
              ) : (
                <ChevronRightIcon aria-hidden="true" className="size-icon" />
              )}
              <span>{INK_WORDS.variablesToggle(snap.variables.length)}</span>
            </Button>
          ) : null}
          <span
            className="inline-flex"
            title={canBack ? undefined : INK_WORDS.backUnavailable}
          >
            <Button
              variant="outline"
              size="sm"
              disabled={!canBack}
              title={canBack ? undefined : INK_WORDS.backUnavailable}
              className={canBack ? "cursor-pointer" : "cursor-not-allowed"}
              onClick={() => controller.ctrl.back()}
            >
              {INK_WORDS.back}
            </Button>
          </span>
          <span
            className="inline-flex"
            title={canRestart ? undefined : INK_WORDS.restartUnavailable}
          >
            <Button
              variant="outline"
              size="sm"
              disabled={!canRestart}
              title={canRestart ? undefined : INK_WORDS.restartUnavailable}
              className={canRestart ? "cursor-pointer" : "cursor-not-allowed"}
              onClick={() => controller.ctrl.restart()}
            >
              {INK_WORDS.restart}
            </Button>
          </span>
        </div>
      </div>

      {playingLastGood ? (
        <div
          role="status"
          aria-live="polite"
          className="border-b border-line bg-subtle px-3 py-1.5 text-meta text-fg-muted"
        >
          {INK_WORDS.playingLastGood}
        </div>
      ) : null}

      {varsOpen ? (
        <VariablesDrawer
          id={varsDrawerId}
          variables={snap.variables}
          onChange={(name, value) => controller.ctrl.editVariable(name, value)}
        />
      ) : null}

      {snap.workerStopped ? (
        <WorkerStoppedCard
          busy={snap.busy}
          onRestartWorker={() => controller.ctrl.restartWorker()}
        />
      ) : nothingCompiled ? (
        <NothingCompiledCard
          problemCount={snap.compile.problems.length}
          onOpenProblem={openFirstProblem}
        />
      ) : !snap.started ? (
        <PlayerReadyCard onPlay={() => controller.ctrl.play()} />
      ) : (
        <>
          <div
            ref={transcriptRegionRef}
            role="region"
            aria-label={INK_WORDS.transcriptLabel}
            className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-4 py-4"
          >
            <div
              role="log"
              aria-live="polite"
              aria-relevant="additions"
              aria-atomic="false"
              className="flex flex-col gap-1"
            >
              {snap.transcript.map((item, index) => (
                <TranscriptEntry
                  key={`${item.kind}:${index}`}
                  item={item}
                  onJumpLine={jumpLine}
                />
              ))}
            </div>

            {snap.diverged ? (
              <p
                role="status"
                aria-live="polite"
                className="mt-2 rounded-control border border-line bg-subtle px-3 py-2 text-meta text-fg-muted"
              >
                {INK_WORDS.storyChanged}
              </p>
            ) : null}

            {snap.fault !== null ? (
              <StoryFaultAlert
                fault={snap.fault}
                alertRef={faultRef}
                onJumpLine={jumpLine}
              />
            ) : null}

            {snap.ended && snap.fault === null ? (
              <div className="mt-3 flex items-center gap-3 border-t border-line pt-3">
                <span
                  role="status"
                  aria-live="polite"
                  className="text-ui font-medium text-fg-muted"
                >
                  {INK_WORDS.theEnd}
                </span>
                <Button
                  ref={restartEndRef}
                  variant="outline"
                  size="sm"
                  className="cursor-pointer"
                  onClick={() => controller.ctrl.restart()}
                >
                  {INK_WORDS.restart}
                </Button>
              </div>
            ) : null}
            <div ref={transcriptEndRef} />
          </div>

          <ChoicesList
            choices={snap.choices}
            busy={snap.busy}
            containerRef={choicesContainerRef}
            buttonRefs={choiceRefs}
            onChoose={(choice) => controller.ctrl.choose(choice)}
          />
        </>
      )}
    </div>
  );
}

function useInkPlayerTitle(docId: string): string {
  return INK_WORDS.besideTitle(useDocumentTitle(docId));
}

export const INK_PLAYER_BESIDE: BesideKind = {
  id: "ink_player",
  title: useInkPlayerTitle,
  hasStatus: false,
  Body: InkPlayerBeside,
};
