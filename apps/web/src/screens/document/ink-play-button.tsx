// Contextual Play button in the script title bar: drawn only for Ink scripts, showing compile problem dot and Beside toggle.
import {
  Button,
  INK_WORDS,
  Kbd,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  keyLabel,
  useCommandState,
  useCommands,
} from "@manent/ui";
import { PlayIcon } from "lucide-react";
import { useCallback, useId, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { closeBeside, useBeside } from "../../beside/open-beside.ts";
import {
  inkCompileClient,
  subscribeInkCompile,
} from "../../ink/compile-client.ts";
import { useEnvironment } from "../../services/context.tsx";

/**
 * Quiet ghost trigger directly before History on Ink scripts: toggles the Ink player Beside,
 * surfaces a static attention dot when closed with compile problems, and collapses to icon-only below 2xl.
 */
export function InkPlayButton(props: { readonly docId: string }): ReactNode {
  const { docId } = props;
  const { service, platform } = useCommands();
  const { dom } = useEnvironment();
  const state = useCommandState("ink.play");
  const beside = useBeside();
  const problemDescId = useId();

  const subscribe = useCallback(
    (listener: () => void) => subscribeInkCompile(docId, listener),
    [docId],
  );
  const problemCount = useSyncExternalStore(
    subscribe,
    () => inkCompileClient(docId)?.snapshot().problems.length ?? 0,
    () => 0,
  );

  if (!state.visible) return null;

  const open =
    beside !== null && beside.kind === "ink_player" && beside.docId === docId;
  const showDot = !open && problemCount > 0;
  const [chord] = state.keys;
  const tooltipText = open
    ? INK_WORDS.closePlayer
    : problemCount > 0
      ? INK_WORDS.playWithProblems(problemCount)
      : INK_WORDS.play;

  const handleClick = (): void => {
    if (open) {
      closeBeside();
      dom.focusPage();
    } else {
      service.run("ink.play", "control");
    }
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              data-tour="title:ink-play"
              aria-pressed={open}
              aria-describedby={showDot ? problemDescId : undefined}
              className={
                open
                  ? "relative h-control cursor-pointer gap-1.5 bg-selected px-2 text-ui font-medium text-fg-accent hover:bg-selected hover:text-fg-accent @max-2xl:w-control @max-2xl:px-0"
                  : "relative h-control cursor-pointer gap-1.5 px-2 text-ui font-medium text-fg-muted hover:bg-subtle hover:text-fg @max-2xl:w-control @max-2xl:px-0"
              }
              onClick={handleClick}
            />
          }
        >
          <PlayIcon aria-hidden="true" className="size-icon shrink-0" />
          <span className="@max-2xl:sr-only">{INK_WORDS.play}</span>
          {showDot ? (
            <span
              aria-hidden="true"
              className="mn-status-dot pointer-events-none absolute top-1 end-1 size-1.5 rounded-full bg-attention"
            />
          ) : null}
        </TooltipTrigger>
        <TooltipContent className="flex items-center gap-1.5">
          <span>{tooltipText}</span>
          {chord === undefined ? null : <Kbd>{keyLabel(chord, platform)}</Kbd>}
        </TooltipContent>
      </Tooltip>
      {showDot ? (
        <span id={problemDescId} className="sr-only">
          {INK_WORDS.problemsCount(problemCount)}
        </span>
      ) : null}
    </>
  );
}
