// Top control bar for the Game Script player Beside: scene picker, cue toggle, Flags toggle, Back, and Restart.
import type { GameSceneSummary } from "@manent/schema";
import { Button, INK_WORDS } from "@manent/ui";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import type { ReactNode } from "react";

export function GamePlayerToolbar(props: {
  readonly scenes: readonly GameSceneSummary[];
  readonly currentScene: GameSceneSummary | null;
  readonly editedFlagCount: number;
  readonly flagCount: number;
  readonly flagsOpen: boolean;
  readonly flagsDrawerId: string;
  readonly hasCues: boolean;
  readonly showCues: boolean;
  readonly canBack: boolean;
  readonly canRestart: boolean;
  readonly onSelectScene: (sceneId: string | null) => void;
  readonly onToggleCues: () => void;
  readonly onToggleFlags: () => void;
  readonly onBack: () => void;
  readonly onRestart: () => void;
}): ReactNode {
  const {
    scenes,
    currentScene,
    editedFlagCount,
    flagCount,
    flagsOpen,
    flagsDrawerId,
    hasCues,
    showCues,
    canBack,
    canRestart,
    onSelectScene,
    onToggleCues,
    onToggleFlags,
    onBack,
    onRestart,
  } = props;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-line bg-chrome px-3 py-2 text-ui">
      {scenes.length > 0 ? (
        <select
          aria-label={INK_WORDS.sceneSelectLabel}
          data-tour="game:scene-select"
          value={currentScene?.id ?? scenes[0]!.id}
          onChange={(event) => {
            const nextId = event.target.value;
            const isFirst = scenes[0]?.id === nextId;
            onSelectScene(isFirst ? null : nextId);
          }}
          className="h-control-sm max-w-56 min-w-0 cursor-pointer truncate rounded-control border border-line bg-raised px-2 font-mono text-meta font-medium text-fg focus-visible:outline-2 focus-visible:outline-ring"
        >
          {scenes.map((scene) => (
            <option key={scene.id} value={scene.id}>
              {INK_WORDS.sceneOption(scene.index + 1, scene.heading)}
            </option>
          ))}
        </select>
      ) : null}

      {editedFlagCount > 0 ? (
        <span className="mn-tag">{INK_WORDS.flagsEdited}</span>
      ) : null}

      <div className="ms-auto flex items-center gap-1.5">
        {hasCues ? (
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={showCues}
            aria-label={
              showCues ? INK_WORDS.cuesHideLabel : INK_WORDS.cuesShowLabel
            }
            title={showCues ? INK_WORDS.cuesHideLabel : INK_WORDS.cuesShowLabel}
            className={
              showCues
                ? "cursor-pointer gap-1 bg-selected text-meta text-fg-accent hover:bg-selected hover:text-fg-accent"
                : "cursor-pointer gap-1 text-meta text-fg-muted hover:text-fg"
            }
            onClick={onToggleCues}
          >
            <SlidersHorizontalIcon
              aria-hidden="true"
              className="size-icon shrink-0"
            />
            <span>{INK_WORDS.cuesToggle}</span>
          </Button>
        ) : null}

        {flagCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={flagsOpen}
            aria-controls={flagsDrawerId}
            className="cursor-pointer gap-1 text-meta text-fg-muted hover:text-fg"
            onClick={onToggleFlags}
          >
            {flagsOpen ? (
              <ChevronDownIcon aria-hidden="true" className="size-icon" />
            ) : (
              <ChevronRightIcon aria-hidden="true" className="size-icon" />
            )}
            <span>{INK_WORDS.flagsToggle(flagCount)}</span>
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
            onClick={onBack}
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
            onClick={onRestart}
          >
            {INK_WORDS.restart}
          </Button>
        </span>
      </div>
    </div>
  );
}
