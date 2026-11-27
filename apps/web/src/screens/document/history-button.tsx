// Top-bar Version history toggle button shared by Script and Rundown title bars, seated directly beside Share.
import {
  Button,
  DOCUMENT_WORDS,
  Kbd,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  keyLabel,
  useCommandState,
  useCommands,
} from "@manent/ui";
import { useRouterState } from "@tanstack/react-router";
import { HistoryIcon } from "lucide-react";
import type { ReactNode } from "react";
import { usePanel } from "../../state/panels.store.ts";
import { useHandInVisible } from "../../writing/hand-in-view.tsx";
import { useToReviewVisible } from "./to-review.tsx";

/**
 * Quiet ghost icon trigger beside Share that navigates to the dedicated read-only Version history page (`/s/$docId/history`).
 * Displays a calm attention dot when To review or Hand-in has waiting items.
 */
export function HistoryButton(props: { readonly docId: string }): ReactNode {
  const { docId } = props;
  const { service, platform } = useCommands();
  const state = useCommandState("history.open");
  const routeId = useRouterState({
    select: (s): string | null => s.matches.at(-1)?.routeId ?? null,
  });
  const open =
    routeId === "/s/$docId/history" || usePanel("side").tab === "history";
  const hasReview = useToReviewVisible(docId);
  const hasHandIn = useHandInVisible(docId);
  if (!state.visible) return null;
  const [chord] = state.keys;
  const attention = !open && (hasReview || hasHandIn);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-tour="tab:history"
            aria-label={DOCUMENT_WORDS.historyTab}
            aria-pressed={open}
            className={
              open
                ? "relative cursor-pointer bg-selected text-fg-accent hover:bg-selected hover:text-fg-accent"
                : "relative cursor-pointer text-fg-muted hover:bg-subtle hover:text-fg"
            }
            onClick={() => service.run("history.open", "control")}
          />
        }
      >
        <HistoryIcon aria-hidden="true" className="size-icon-lg" />
        {attention ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1 end-1 size-1.5 rounded-full bg-attention"
          />
        ) : null}
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-1.5">
        <span>
          {open
            ? DOCUMENT_WORDS.closeVersionHistory
            : DOCUMENT_WORDS.versionHistory}
        </span>
        {chord === undefined ? null : <Kbd>{keyLabel(chord, platform)}</Kbd>}
      </TooltipContent>
    </Tooltip>
  );
}
