// Game Script player Beside: scene picker, collapsible Flags drawer, script-aware transcript, cue toggle, and choices.
import type { GameChoiceOption } from "@manent/schema";
import { Button, INK_WORDS } from "@manent/ui";
import { ClapperboardIcon } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type { BesideKind } from "../../beside/kinds.ts";
import { EmptyHeroCard } from "../../empty-hero-card.tsx";
import {
  ChoicesList,
  PlayerHeroShell,
  PlayerReadyCard,
} from "../../ink/player/player-parts.tsx";
import { createInkPlaythroughStore } from "../../ink/player/storage.ts";
import type { InkPlaythroughStore } from "../../ink/player/storage.ts";
import { VariablesDrawer } from "../../ink/player/variables-drawer.tsx";
import { useDocumentTitle } from "../../screens/document/title-bar.tsx";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { createGamePlayerController } from "./controller.ts";
import type { GamePlayerController } from "./controller.ts";
import { GamePlayerToolbar } from "./player-toolbar.tsx";
import {
  jumpToGameBlock,
  readLiveGameBlocks,
  subscribeLiveGameBlocks,
} from "./source-nav.ts";
import { GameTranscriptRow } from "./transcript-row.tsx";

const DIGIT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
const noopUnsub = (): (() => void) => () => {};
const readNull = (): null => null;

interface GamePlayerRuntime {
  readonly ctrl: GamePlayerController;
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

/** Beside body for a Game Script: interactive playthrough with scene switching, editable Flags, cues, and choices. */
export function GamePlayerBeside(props: {
  docId: string;
  at: { blockId: string } | null;
}): ReactNode {
  const { docId } = props;
  const { userId, editor, documentBlocks } = useServices();
  const { storage, storageEvents, now } = useEnvironment();
  const [flagsOpen, setFlagsOpen] = useState(false);
  const [showCues, setShowCues] = useState(true);
  const flagsDrawerId = useId();
  const choicesContainerRef = useRef<HTMLDivElement | null>(null);
  const transcriptRegionRef = useRef<HTMLDivElement | null>(null);
  const choiceRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const restartEndRef = useRef<HTMLButtonElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const [runtime, setRuntime] = useState<GamePlayerRuntime | null>(null);

  useEffect(() => {
    let active = true;
    const store = createInkPlaythroughStore({
      storage,
      events: storageEvents,
      userId,
      keyPrefix: "manent.game",
    });
    const ctrl = createGamePlayerController({ docId, store, now });
    const nextRuntime: GamePlayerRuntime = { ctrl, store };
    setRuntime(nextRuntime);

    const stopLive = subscribeLiveGameBlocks(docId, (blocks) => {
      if (active) ctrl.setBlocks(blocks);
    });

    void (async () => {
      const live = await readLiveGameBlocks(docId);
      if (!active) return;
      if (live !== null) {
        ctrl.setBlocks(live);
        return;
      }
      const stored = await documentBlocks(docId).catch(() => null);
      if (active) ctrl.setBlocks(stored ?? []);
    })();

    return () => {
      active = false;
      stopLive();
      ctrl.dispose();
      store.dispose();
      setRuntime((current) => (current === nextRuntime ? null : current));
    };
  }, [docId, storage, storageEvents, userId, now, documentBlocks]);

  const snap = useSyncExternalStore(
    runtime?.ctrl.subscribe ?? noopUnsub,
    runtime?.ctrl.snapshot ?? readNull,
    runtime?.ctrl.snapshot ?? readNull,
  );

  useEffect(() => {
    if (snap === null || snap.focusNonce === 0) return;
    transcriptEndRef.current?.scrollIntoView?.({ block: "nearest" });
    if (snap.choices.length > 0) {
      choiceRefs.current[0]?.focus();
    } else if (snap.ended) {
      restartEndRef.current?.focus();
    }
  }, [snap?.focusNonce, snap?.choices.length, snap?.ended]);

  if (runtime === null || snap === null) return null;

  const canBack = snap.started && snap.recordedChoices.length > 0;
  const canRestart =
    snap.started &&
    (snap.recordedChoices.length > 0 ||
      snap.editedFlags.length > 0 ||
      snap.ended ||
      snap.startSceneId !== null);
  const hasCues = snap.transcript.some((item) => item.kind === "cue");
  const isEmpty =
    snap.loaded &&
    snap.started &&
    snap.transcript.length === 0 &&
    snap.choices.length === 0;

  const handleChoose = (choice: GameChoiceOption): void => {
    runtime.ctrl.choose(choice);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (isTypingTarget(event.target)) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (snap.choices.length === 0) return;
    const digitIndex = DIGIT_KEYS.indexOf(
      event.key as (typeof DIGIT_KEYS)[number],
    );
    if (digitIndex >= 0) {
      const target = snap.choices[digitIndex];
      if (target !== undefined) {
        event.preventDefault();
        handleChoose(target);
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

  const jumpBlock = (blockId: string): void => {
    jumpToGameBlock(blockId, editor);
  };

  const inkChoices = snap.choices.map((choice) => ({
    index: choice.index,
    text: choice.text,
  }));

  return (
    <div
      data-tour="game:player"
      onKeyDown={onKeyDown}
      className="flex min-h-0 flex-1 flex-col bg-chrome text-fg"
    >
      <GamePlayerToolbar
        scenes={snap.scenes}
        currentScene={snap.currentScene}
        editedFlagCount={snap.editedFlags.length}
        flagCount={snap.flags.length}
        flagsOpen={flagsOpen}
        flagsDrawerId={flagsDrawerId}
        hasCues={hasCues}
        showCues={showCues}
        canBack={canBack}
        canRestart={canRestart}
        onSelectScene={(sceneId) => runtime.ctrl.selectScene(sceneId)}
        onToggleCues={() => setShowCues((shown) => !shown)}
        onToggleFlags={() => setFlagsOpen((open) => !open)}
        onBack={() => runtime.ctrl.back()}
        onRestart={() => runtime.ctrl.restart()}
      />

      {flagsOpen ? (
        <VariablesDrawer
          id={flagsDrawerId}
          variables={snap.flags}
          onChange={(name, value) => runtime.ctrl.editFlag(name, value)}
        />
      ) : null}

      {isEmpty ? (
        <PlayerHeroShell>
          <EmptyHeroCard
            compact
            icon={<ClapperboardIcon aria-hidden="true" className="size-4" />}
            title={INK_WORDS.emptyGameScriptTitle}
            description={INK_WORDS.emptyGameScriptDetail}
          />
        </PlayerHeroShell>
      ) : !snap.started ? (
        <PlayerReadyCard onPlay={() => runtime.ctrl.play()} />
      ) : (
        <>
          <div
            ref={transcriptRegionRef}
            role="region"
            aria-label={INK_WORDS.transcriptLabel}
            className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3.5 py-4"
          >
            <div
              role="log"
              aria-live="polite"
              aria-relevant="additions"
              aria-atomic="false"
              className="flex flex-col gap-1.5"
            >
              {snap.transcript.map((item, index) => (
                <GameTranscriptRow
                  key={`${item.kind}:${item.blockId}:${index}`}
                  item={item}
                  showCues={showCues}
                  onJumpBlock={jumpBlock}
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

            {snap.ended ? (
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
                  onClick={() => runtime.ctrl.restart()}
                >
                  {INK_WORDS.restart}
                </Button>
              </div>
            ) : null}
            <div ref={transcriptEndRef} />
          </div>

          <ChoicesList
            choices={inkChoices}
            busy={false}
            containerRef={choicesContainerRef}
            buttonRefs={choiceRefs}
            onChoose={(picked) => {
              const match = snap.choices[picked.index];
              if (match !== undefined) handleChoose(match);
            }}
          />
        </>
      )}
    </div>
  );
}

function useGamePlayerTitle(docId: string): string {
  return INK_WORDS.besideTitle(useDocumentTitle(docId));
}

export const GAME_PLAYER_BESIDE: BesideKind = {
  id: "game_player",
  title: useGamePlayerTitle,
  hasStatus: false,
  Body: GamePlayerBeside,
};
