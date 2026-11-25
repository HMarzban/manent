// The right panel's Comments tab: exclusive filters (Open, Mine, Writers only, rounds), thread rows and empty states.
import type { Choice, SettingValue } from "@manent/settings";
import { COMMENTS_WORDS, HISTORY_WORDS, Segmented, Skeleton } from "@manent/ui";
import { MessageSquareIcon } from "lucide-react";
import { useCallback, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { EmptyHeroCard } from "../empty-hero-card.tsx";
import { useEnvironment, useServices } from "../services/context.tsx";
import type { PanelTab } from "../shell/panel-tab.ts";
import {
  commentsActions,
  useComments,
  useCommentsUi,
  useRetainComments,
} from "../state/comments.store.ts";
import { filteredThreads, sortedRounds } from "./comments-filter.ts";
import { RoundRow } from "./round-row.tsx";
import { NoteRow, ThreadRow } from "./thread-rows.tsx";

function useScriptFormat(docId: string | null): SettingValue<"script.format"> {
  const { settings, openScriptStore } = useServices();
  const store = docId === null ? settings : openScriptStore(docId);
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe("script.format", listener),
    [store],
  );
  return useSyncExternalStore(subscribe, () => store.get("script.format"));
}

const SKELETON_CARDS = [
  { author: "w-28", line: "w-4/5" },
  { author: "w-32", line: "w-2/3" },
  { author: "w-24", line: "w-3/4" },
] as const;

function CommentsSkeleton(): ReactNode {
  return (
    <div aria-busy="true" className="divide-y divide-line">
      {SKELETON_CARDS.map((card, index) => (
        <div key={index} aria-hidden="true" className="flex flex-col gap-2 p-3">
          <div className="flex items-center gap-2">
            <Skeleton className="size-avatar-sm shrink-0 rounded-full" />
            <Skeleton className={`h-3 ${card.author}`} />
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className={`h-3 ${card.line}`} />
        </div>
      ))}
    </div>
  );
}

function CommentsTab(props: { docId: string | null }): ReactNode {
  const { docId } = props;
  const services = useServices();
  const { where, now } = useEnvironment();
  const state = useComments(docId);
  const ui = useCommentsUi(docId);
  const format = useScriptFormat(docId);

  if (docId === null) return null;

  const filterChoices: Choice<string>[] = [
    { value: "open", label: COMMENTS_WORDS.filterOpen },
    { value: "mine", label: COMMENTS_WORDS.filterMine },
    ...(state.canEdit
      ? [{ value: "writers", label: COMMENTS_WORDS.writersOnly }]
      : []),
  ];
  const rounds = sortedRounds(state.rounds);
  const threads = filteredThreads(state, ui.filter, services.userId);
  const notes = state.canEdit && ui.filter === "writers" ? state.notes : [];
  const currentNow = now();
  const isEmpty =
    ui.filter === "writers" ? notes.length === 0 : threads.length === 0;
  const emptyText =
    format === "variety"
      ? where.platform === "mac"
        ? COMMENTS_WORDS.emptyVarietyMac
        : COMMENTS_WORDS.emptyVarietyOther
      : where.platform === "mac"
        ? COMMENTS_WORDS.emptyMac
        : COMMENTS_WORDS.emptyOther;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b border-line p-3">
        <Segmented
          label={HISTORY_WORDS.filter}
          size="sm"
          value={ui.filter.startsWith("round:") ? "" : ui.filter}
          options={filterChoices}
          onChange={(next) => commentsActions.setFilter(docId, next)}
        />
        {rounds.length === 0 ? null : (
          <div className="flex flex-col gap-0.5">
            {rounds.map(({ id, round }) => (
              <RoundRow
                key={id}
                docId={docId}
                roundId={id}
                round={round}
                selected={ui.filter === `round:${id}`}
                canEdit={state.canEdit}
                services={services}
                onSelect={() => commentsActions.setFilter(docId, `round:${id}`)}
              />
            ))}
          </div>
        )}
      </div>
      {state.loading && isEmpty ? (
        <CommentsSkeleton />
      ) : isEmpty ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex min-h-full flex-col items-center justify-center p-4">
            <EmptyHeroCard
              compact
              icon={<MessageSquareIcon aria-hidden="true" className="size-4" />}
              description={emptyText}
            />
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
          {ui.filter === "writers"
            ? notes.map((entry) => (
                <NoteRow
                  key={entry.id}
                  entry={entry}
                  removed={
                    entry.note.anchor !== null && state.removedIds.has(entry.id)
                  }
                  active={ui.activeId === entry.id}
                  now={currentNow}
                  onOpen={() =>
                    commentsActions.openPopover(docId, {
                      kind: "open_id",
                      id: entry.id,
                    })
                  }
                />
              ))
            : threads.map((entry) => (
                <ThreadRow
                  key={entry.id}
                  entry={entry}
                  state={state}
                  currentUserId={services.userId}
                  active={ui.activeId === entry.id}
                  now={currentNow}
                  onOpen={() =>
                    commentsActions.openPopover(docId, {
                      kind: "open_id",
                      id: entry.id,
                    })
                  }
                />
              ))}
        </div>
      )}
    </div>
  );
}

export const commentsTab: PanelTab<"comments"> = {
  id: "comments",
  useTab(docId) {
    const services = useServices();
    useRetainComments(docId, services);
    return { present: docId !== null, label: COMMENTS_WORDS.tab };
  },
  Tab: CommentsTab,
};
