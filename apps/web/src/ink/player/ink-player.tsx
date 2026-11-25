// Ink player Beside: header bar, collapsible Variables drawer, passage transcript, choices, and keyboard controls.
import { Button, INK_WORDS } from "@manent/ui";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  TriangleAlertIcon,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type { BesideKind } from "../../beside/kinds.ts";
import { useDocumentTitle } from "../../screens/document/title-bar.tsx";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { createInkPlayerController } from "./controller.ts";
import { ChoicesList, CompileBadge, TranscriptEntry } from "./player-parts.tsx";
import { jumpToInkLine } from "./source-nav.ts";
import { createInkPlaythroughStore } from "./storage.ts";
import { VariablesDrawer } from "./variables-drawer.tsx";

const DIGIT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
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
  const choiceRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const restartEndRef = useRef<HTMLButtonElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  const controller = useMemo(() => {
    const store = createInkPlaythroughStore({
      storage,
      events: storageEvents,
      userId,
    });
    const ctrl = createInkPlayerController({ docId, store, now });
    return { ctrl, store };
  }, [docId, storage, storageEvents, userId, now]);

  useEffect(() => {
    return () => {
      controller.ctrl.dispose();
      controller.store.dispose();
    };
  }, [controller]);

  const snap = useSyncExternalStore(
    controller.ctrl.subscribe,
    controller.ctrl.snapshot,
    controller.ctrl.snapshot,
  );

  useEffect(() => {
    if (snap.focusNonce === 0) return;
    transcriptEndRef.current?.scrollIntoView({ block: "nearest" });
    if (snap.choices.length > 0) {
      choiceRefs.current[0]?.focus();
    } else if (snap.ended && snap.fault === null) {
      restartEndRef.current?.focus();
    }
  }, [snap.focusNonce, snap.choices.length, snap.ended, snap.fault]);

  const jumpLine = (line: number): void => {
    void jumpToInkLine(docId, line, editor);
  };

  const firstProblemLine = snap.compile.problems[0]?.line ?? null;
  const openFirstProblem = (): void => {
    if (firstProblemLine !== null) jumpLine(firstProblemLine);
  };

  const canBack = snap.started && snap.recordedChoices.length > 0 && !snap.busy;
  const canRestart =
    snap.started &&
    !snap.busy &&
    (snap.recordedChoices.length > 0 ||
      snap.editedVariables.length > 0 ||
      snap.ended ||
      snap.fault !== null ||
      snap.startKnot !== null);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (isTypingTarget(event.target)) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (snap.choices.length === 0 || snap.busy) return;
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
      event.preventDefault();
      const buttons = choiceRefs.current.slice(0, snap.choices.length);
      const current = buttons.findIndex(
        (btn) => btn === document.activeElement,
      );
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
    snap.compile.lastGood !== null && snap.compile.problems.length > 0;

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
          <Button
            variant="outline"
            size="sm"
            disabled={!canBack}
            className={canBack ? "cursor-pointer" : "cursor-not-allowed"}
            onClick={() => controller.ctrl.back()}
          >
            {INK_WORDS.back}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!canRestart}
            className={canRestart ? "cursor-pointer" : "cursor-not-allowed"}
            onClick={() => controller.ctrl.restart()}
          >
            {INK_WORDS.restart}
          </Button>
        </div>
      </div>

      {playingLastGood ? (
        <div className="border-b border-line bg-subtle px-3 py-1.5 text-meta text-fg-muted">
          {INK_WORDS.playingLastGood}
        </div>
      ) : null}

      {varsOpen ? (
        <VariablesDrawer
          variables={snap.variables}
          onChange={(name, value) => controller.ctrl.editVariable(name, value)}
        />
      ) : null}

      <div
        role="region"
        aria-label={INK_WORDS.transcriptLabel}
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-4 py-4"
      >
        {nothingCompiled ? (
          <div className="flex flex-col items-start gap-2 pt-2">
            <p className="text-ui text-fg">{INK_WORDS.nothingCompiled}</p>
            <CompileBadge
              state="up_to_date"
              problemCount={snap.compile.problems.length}
              onOpenProblem={openFirstProblem}
            />
          </div>
        ) : !snap.started ? (
          <div className="flex flex-col items-start gap-3 pt-2">
            <p className="text-ui text-fg-muted">{INK_WORDS.pressPlay}</p>
            <Button
              variant="default"
              size="sm"
              data-tour="ink:play"
              className="cursor-pointer"
              onClick={() => controller.ctrl.play()}
            >
              {INK_WORDS.play}
            </Button>
          </div>
        ) : (
          <>
            {snap.transcript.map((item, index) => (
              <TranscriptEntry
                key={`${item.kind}:${index}`}
                item={item}
                onJumpLine={jumpLine}
              />
            ))}

            {snap.diverged ? (
              <p className="mt-2 rounded-control border border-line bg-subtle px-3 py-2 text-meta text-fg-muted">
                {INK_WORDS.storyChanged}
              </p>
            ) : null}

            {snap.fault !== null ? (
              <div
                role="alert"
                className="mt-2 flex flex-col gap-1 rounded-control border border-line bg-subtle px-3 py-2 text-ui text-fg"
              >
                <p className="flex items-center gap-1.5 font-medium">
                  <TriangleAlertIcon
                    aria-hidden="true"
                    className="size-icon shrink-0 text-attention"
                  />
                  {snap.fault.line === null ? (
                    <span>{INK_WORDS.stoppedWithoutLine}</span>
                  ) : (
                    <span>
                      {INK_WORDS.stoppedAtPrefix}{" "}
                      <button
                        type="button"
                        onClick={() => jumpLine(snap.fault!.line!)}
                        className="cursor-pointer underline hover:text-fg-accent"
                      >
                        {INK_WORDS.lineLink(snap.fault.line)}
                      </button>
                      {"."}
                    </span>
                  )}
                </p>
                <p className="font-mono text-meta text-fg-muted">
                  {snap.fault.message}
                </p>
              </div>
            ) : null}

            {snap.ended && snap.fault === null ? (
              <div className="mt-3 flex items-center gap-3 border-t border-line pt-3">
                <span className="text-ui font-medium text-fg-muted">
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
          </>
        )}
      </div>

      <ChoicesList
        choices={snap.choices}
        busy={snap.busy}
        buttonRefs={choiceRefs}
        onChoose={(choice) => controller.ctrl.choose(choice)}
      />
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
