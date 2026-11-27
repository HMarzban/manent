// Contextual Prompter button in the rundown title bar: opens/focuses the prompter window and shows a calm status dot.
import {
  Button,
  Kbd,
  PROMPTER_CONTROL_WORDS,
  PROMPTER_WINDOW_WORDS,
  RUNDOWN_WORDS,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  keyLabel,
  useCommandState,
  useCommands,
} from "@manent/ui";
import { TvIcon } from "lucide-react";
import { useId } from "react";
import type { ReactNode } from "react";
import { usePrompterRuntime } from "../prompter/prompter-session.ts";
import { useRundownView } from "./rundown-view-store.ts";

/**
 * Quiet ghost trigger directly before History on rundowns: runs `view.presentOnPrompter`,
 * displays a calm static status dot across controlling/operator/changed/live states, and collapses to icon-only below 2xl.
 */
export function PrompterTitleButton(props: {
  readonly docId: string;
}): ReactNode {
  const { docId } = props;
  const { service, platform } = useCommands();
  const state = useCommandState("view.presentOnPrompter");
  const prompter = usePrompterRuntime(state.visible ? docId : null);
  const view = useRundownView(docId);
  const statusId = useId();

  if (!state.visible) return null;

  const changedCount =
    view?.rundown?.rows.filter(
      (row) => row.docId !== null && row.prompter?.state !== "on",
    ).length ?? 0;

  let dotTone: "ok" | "attention" | null = null;
  let tooltipText: string = RUNDOWN_WORDS.presentOnPrompter;
  let active = false;

  if (prompter.isOperator) {
    active = true;
    dotTone = "ok";
    tooltipText = PROMPTER_WINDOW_WORDS.prompterControlling;
  } else if (prompter.operator !== null) {
    dotTone = "ok";
    tooltipText = PROMPTER_WINDOW_WORDS.prompterWithStatus(
      PROMPTER_CONTROL_WORDS.controlsPrompter(prompter.operator.name),
    );
  } else if (prompter.online && prompter.hasSentRow && changedCount > 0) {
    dotTone = "attention";
    tooltipText = PROMPTER_WINDOW_WORDS.prompterChanged(changedCount);
  } else if (prompter.online && prompter.hasSentRow && changedCount === 0) {
    dotTone = "ok";
    tooltipText = PROMPTER_WINDOW_WORDS.prompterLive;
  }

  const nonIdle = dotTone !== null;
  const [chord] = state.keys;

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              data-tour="title:prompter"
              data-active={active ? "true" : undefined}
              aria-describedby={nonIdle ? statusId : undefined}
              className={
                active
                  ? "relative h-control cursor-pointer gap-1.5 bg-selected px-2 text-ui font-medium text-fg-accent hover:bg-selected hover:text-fg-accent @max-2xl:w-control @max-2xl:px-0"
                  : "relative h-control cursor-pointer gap-1.5 px-2 text-ui font-medium text-fg-muted hover:bg-subtle hover:text-fg @max-2xl:w-control @max-2xl:px-0"
              }
              onClick={() => service.run("view.presentOnPrompter", "control")}
            />
          }
        >
          <TvIcon aria-hidden="true" className="size-icon shrink-0" />
          <span className="@max-2xl:sr-only">
            {RUNDOWN_WORDS.columns.prompter}
          </span>
          {dotTone === null ? null : (
            <span
              aria-hidden="true"
              className={
                dotTone === "ok"
                  ? "mn-status-dot pointer-events-none absolute top-1 end-1 size-1.5 rounded-full bg-ok"
                  : "mn-status-dot pointer-events-none absolute top-1 end-1 size-1.5 rounded-full bg-attention"
              }
            />
          )}
        </TooltipTrigger>
        <TooltipContent className="flex items-center gap-1.5">
          <span>{tooltipText}</span>
          {chord === undefined ? null : <Kbd>{keyLabel(chord, platform)}</Kbd>}
        </TooltipContent>
      </Tooltip>
      {nonIdle ? (
        <span id={statusId} className="sr-only">
          {tooltipText}
        </span>
      ) : null}
    </>
  );
}
