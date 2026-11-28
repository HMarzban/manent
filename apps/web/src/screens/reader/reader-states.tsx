// Scrollable refusal and accessible loading states for the external reader frame (`/r/$token`).
import type { DraftOpenResponse } from "@manent/sync-protocol";
import {
  Button,
  DIALOG_WORDS,
  DOCUMENT_WORDS,
  LINKS_WORDS,
  READER_WORDS,
  Skeleton,
  stateBarLines,
} from "@manent/ui";
import type { StateFact, StateLine } from "@manent/ui";
import { Link2OffIcon, LockIcon, WifiOffIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ScriptPageSkeleton } from "../../editor-host/script-page-skeleton.tsx";
import { EmptyHeroCard } from "../../empty-hero-card.tsx";
import type { ReaderCommentsState } from "../../reader/reader-comments.ts";
import {
  formatReaderDayDate,
  readerRefusalText,
} from "../../reader/use-reader-draft.ts";
import type {
  ActiveReaderComparison,
  ReaderRefusal,
} from "../../reader/use-reader-draft.ts";

/** Maps each block with an open public comment thread to its newest open thread id. */
export function openThreadsByBlock(
  state: ReaderCommentsState | null,
): ReadonlyMap<string, string> {
  const byBlock = new Map<string, string>();
  if (state === null) return byBlock;
  const entries = Object.entries(state.threads).toSorted(
    ([, a], [, b]) => b.createdAt - a.createdAt,
  );
  for (const [id, thread] of entries) {
    if (
      thread.state.kind === "open" &&
      thread.anchor !== null &&
      !byBlock.has(thread.anchor.blockId)
    )
      byBlock.set(thread.anchor.blockId, id);
  }
  return byBlock;
}

/** Builds a passive informational StateLine with no action buttons. */
export const readerInfoLine = (sentence: string): StateLine => ({
  sentence,
  chip: null,
  actions: [],
  dismiss: null,
  attention: false,
});

/** Computes left and right StateBar lines for a ready reader draft (Ink or screenplay). */
export function readerBarLines(options: {
  readonly draft: DraftOpenResponse;
  readonly isInk: boolean;
  readonly offlineOpenedAt: number | null;
  readonly signedIn: boolean;
  readonly comparison: ActiveReaderComparison | null;
  readonly readAloudFacts: readonly StateFact[];
}): { readonly left: StateLine | null; readonly right: StateLine | null } {
  const {
    draft,
    isInk,
    offlineOpenedAt,
    signedIn,
    comparison,
    readAloudFacts,
  } = options;
  const date = formatReaderDayDate(draft.sentAt);
  const bar = isInk
    ? {
        left: readerInfoLine(READER_WORDS.inkDraft(draft.name, date)),
        right: null,
      }
    : stateBarLines([
        { kind: "reader_draft", name: draft.name, date },
        ...(comparison !== null && comparison.baselineName !== ""
          ? [
              {
                kind: "showing_changes" as const,
                name: comparison.baselineName,
                date: null,
              },
            ]
          : []),
        ...readAloudFacts,
      ]);
  let right: StateLine | null = bar.right;
  if (right === null && offlineOpenedAt !== null) {
    right = readerInfoLine(
      READER_WORDS.offlineCopy(formatReaderDayDate(offlineOpenedAt)),
    );
  } else if (right === null && !isInk && signedIn && draft.canComment) {
    right = readerInfoLine(READER_WORDS.canComment);
  }
  return { left: bar.left, right };
}

export function ReaderRefusalView(props: {
  readonly reason: ReaderRefusal;
  readonly standalone: boolean;
  onRetry?(): void;
}): ReactNode {
  const { reason, standalone, onRetry } = props;
  const Icon =
    reason === "not_sent"
      ? LockIcon
      : reason === "unreachable"
        ? WifiOffIcon
        : Link2OffIcon;
  return (
    <div
      className={`z-10 flex overflow-y-auto bg-chrome p-6 text-fg ${standalone ? "h-dvh" : "min-h-0 flex-1"}`}
    >
      <div className="flex min-h-full w-full flex-col items-center justify-center">
        <EmptyHeroCard
          icon={<Icon aria-hidden="true" className="size-5" />}
          headingAs="h1"
          headingTabIndex={-1}
          title={LINKS_WORDS.linkUnavailable}
          description={readerRefusalText(reason)}
          descriptionRole={reason === "unreachable" ? "alert" : undefined}
          actions={
            <>
              {reason === "unreachable" ? (
                <Button
                  variant="default"
                  onClick={() =>
                    onRetry !== undefined ? onRetry() : window.location.reload()
                  }
                >
                  {DIALOG_WORDS.tryAgain}
                </Button>
              ) : null}
              <Button
                variant="outline"
                nativeButton={false}
                render={<a href="/" />}
              >
                {LINKS_WORDS.backToLibrary}
              </Button>
            </>
          }
        />
      </div>
    </div>
  );
}

export function ReaderLoadingView(props: {
  readonly frameClass: string;
}): ReactNode {
  return (
    <div className={props.frameClass}>
      <p role="status" className="sr-only">
        {DOCUMENT_WORDS.opening}
      </p>
      <div aria-busy="true" className="flex min-h-0 flex-1 flex-col">
        <div
          aria-hidden="true"
          className="flex h-statebar shrink-0 items-center justify-between border-b border-line bg-chrome px-3"
        >
          <Skeleton className="h-3.5 w-44" />
          <Skeleton className="h-3.5 w-28" />
        </div>
        <ScriptPageSkeleton />
      </div>
    </div>
  );
}
