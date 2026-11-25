// Prompter column cell for each rundown row: On prompter, Changed — not on prompter (with Send), —, or Offline.
import {
  Button,
  PROMPTER_WORDS,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@manent/ui";
import {
  CheckIcon,
  CloudOffIcon,
  TriangleExclamationPointIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useRundownView } from "../rundown/rundown-view-store.ts";
import { prompterActions } from "../state/prompter.store.ts";
import { titleForRow } from "./prompter-model.ts";
import { usePrompterRuntime } from "./prompter-session.ts";

function SendRowButton(props: {
  readonly title: string;
  readonly waiting: number;
  readonly sending: boolean;
  onSend(): void;
}): ReactNode {
  const { title, waiting, sending, onSend } = props;
  const label = PROMPTER_WORDS.sendRowLabel(title);
  if (waiting > 0) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={<span className="inline-flex shrink-0 cursor-not-allowed" />}
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-tour="prompter.send"
            disabled
            aria-label={label}
            className="pointer-events-none shrink-0"
          >
            {PROMPTER_WORDS.send}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {PROMPTER_WORDS.waitingChanges(waiting)}
        </TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      data-tour="prompter.send"
      disabled={sending}
      aria-label={label}
      className={
        sending ? "shrink-0 cursor-not-allowed" : "shrink-0 cursor-pointer"
      }
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onSend();
      }}
    >
      {PROMPTER_WORDS.send}
    </Button>
  );
}

/**
 * Draws the Prompter column state of `rowId` in `rundownId`:
 * empty on header rows, `Offline — not sending` on every row while offline, `—` on rows with no script,
 * `On prompter` when synced to the prompter, and `Changed — not on prompter` with an outline Send button otherwise.
 */
export function PrompterCell(props: {
  rundownId: string;
  rowId: string;
}): ReactNode {
  const { rundownId, rowId } = props;
  const view = useRundownView(rundownId);
  const runtime = usePrompterRuntime(rundownId);
  const row = view?.rundown?.rows.find((candidate) => candidate.id === rowId);
  if (row === undefined || row.kind === "header") return null;

  if (!runtime.online) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1 text-fg-muted">
        <CloudOffIcon aria-hidden="true" className="size-icon shrink-0" />
        <span className="truncate">{PROMPTER_WORDS.offline}</span>
      </span>
    );
  }

  if (row.kind !== "script" || row.docId === null) {
    return <span className="text-fg-muted">{PROMPTER_WORDS.noScript}</span>;
  }

  if (row.prompter?.state === "on") {
    return (
      <span className="inline-flex min-w-0 items-center gap-1 text-fg-muted">
        <CheckIcon aria-hidden="true" className="size-icon shrink-0" />
        <span className="truncate">{PROMPTER_WORDS.onPrompter}</span>
      </span>
    );
  }

  const title = titleForRow(view, rowId);
  const waiting = runtime.waitingByDocId.get(row.docId) ?? 0;
  const sending = runtime.inFlightRows.has(rowId);

  return (
    <span className="flex w-full min-w-0 items-center justify-between gap-2">
      <span className="inline-flex min-w-0 items-center gap-1 font-medium text-attention">
        <TriangleExclamationPointIcon
          aria-hidden="true"
          className="size-icon shrink-0"
        />
        <span className="truncate">{PROMPTER_WORDS.changed}</span>
      </span>
      {runtime.canSend ? (
        <SendRowButton
          title={title}
          waiting={waiting}
          sending={sending}
          onSend={() => prompterActions.sendRow(rundownId, rowId)}
        />
      ) : null}
    </span>
  );
}
