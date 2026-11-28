// Accessible non-nested episode row: sibling interactive cells (Ep, Title open button, Writer, Stage, Due), responsive narrow summary, RowMenu & context menu.
import type { EpisodeEntry } from "@manent/crdt";
import { SERIES_WORDS, cn, formatCount, formatDate } from "@manent/ui";
import { useState } from "react";
import type { ReactNode } from "react";
import type { RowPlace } from "../../../services/ports.ts";
import { fullNameOf } from "../../../services/sync/index-entries.ts";
import { DOCUMENT_ROW_LINES } from "../document-row-lines.ts";
import { WithRowMenu, placeProps } from "../row-place.tsx";
import {
  COL_MENU,
  COL_PLACE,
  LastEditedCell,
  PagesCell,
  StageCell,
  episodeDisplayTitle,
  resolvedEpisodeStage,
} from "./episode-cells.tsx";
import { DueCell, EpCell, TitleCell, WriterCell } from "./episode-editors.tsx";
import { EpisodeMenuItems } from "./episode-menu.tsx";
import type { EpisodeLastEdited, SeriesPerson } from "./series-facts.ts";

function useEpisodeRowLine(docId: string | null): string | null {
  let line: string | null = null;
  for (const source of DOCUMENT_ROW_LINES) {
    const said = source.useLine(docId ?? "");
    if (docId !== null) line ??= said;
  }
  return line;
}

const DEFAULT_PLACE: RowPlace = { kind: "not_on_device" };

export function EpisodeRow(props: {
  readonly projectId: string;
  readonly episode: EpisodeEntry;
  readonly targetPages: number | null;
  readonly ladder?: readonly string[];
  readonly canEdit: boolean;
  readonly people: readonly SeriesPerson[];
  readonly lastEdited: EpisodeLastEdited;
  readonly place: RowPlace | undefined;
  readonly shell: "web" | "desktop";
  readonly now: number;
  open(docId: string): void;
  onSave(next: EpisodeEntry, renamedTitle?: string | null): void;
}): ReactNode {
  const {
    projectId,
    episode,
    targetPages,
    ladder = [],
    canEdit,
    people,
    lastEdited,
    shell,
    now,
    open,
    onSave,
  } = props;
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingNumber, setEditingNumber] = useState(false);
  const targetDocId = episode.docIds.script ?? episode.docIds.outline;
  const rowLine = useEpisodeRowLine(targetDocId);
  const { trailing, unavailable, busy } = placeProps(
    targetDocId === null ? DEFAULT_PLACE : (props.place ?? { kind: "synced" }),
    shell,
  );

  const writerName =
    episode.writerUserId === null
      ? null
      : (people.find((p) => p.userId === episode.writerUserId)?.name ??
        fullNameOf(episode.writerUserId));
  const stageText =
    episode.openCount !== null && episode.openCount.open > 0
      ? SERIES_WORDS.draftOpen(
          resolvedEpisodeStage(episode) ?? episode.openCount.round,
          episode.openCount.open,
        )
      : resolvedEpisodeStage(episode);
  const compactMeta = [
    writerName,
    stageText,
    episode.pages !== null ? `${formatCount(episode.pages)} pp.` : null,
    episode.dueAt !== null ? formatDate(episode.dueAt) : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");

  const menuEntries = (
    <EpisodeMenuItems
      projectId={projectId}
      episode={episode}
      canEdit={canEdit}
      primaryDocId={targetDocId}
      unavailable={unavailable !== undefined}
      onOpenDoc={open}
      onStartRename={() => setEditingTitle(true)}
      onStartEditNumber={() => setEditingNumber(true)}
    />
  );

  return (
    <WithRowMenu title={episodeDisplayTitle(episode)} entries={menuEntries}>
      {(menu) => (
        <div
          data-row-menu
          aria-busy={busy ? "true" : undefined}
          className={cn(
            "mn-row flex min-h-row-2 flex-col justify-center gap-0.5 px-3 py-1.5 text-ui hover:bg-subtle",
            busy ? "text-fg-muted" : undefined,
          )}
        >
          <div className="flex min-w-0 w-full items-center gap-2">
            <EpCell
              episode={episode}
              canEdit={canEdit}
              editing={editingNumber}
              onEditingChange={setEditingNumber}
              onSave={onSave}
            />
            <TitleCell
              episode={episode}
              canEdit={canEdit}
              editing={editingTitle}
              primaryDocId={targetDocId}
              onEditingChange={setEditingTitle}
              onOpenDoc={open}
              onSave={(next, nextTitle) => onSave(next, nextTitle)}
            />
            <WriterCell
              episode={episode}
              canEdit={canEdit}
              people={people}
              onSave={onSave}
            />
            <StageCell
              episode={episode}
              canEdit={canEdit}
              ladder={ladder}
              onSave={onSave}
            />
            <DueCell
              episode={episode}
              canEdit={canEdit}
              now={now}
              onSave={onSave}
            />
            <PagesCell episode={episode} targetPages={targetPages} />
            <LastEditedCell edited={lastEdited} now={now} />
            <span
              className={cn(
                COL_PLACE,
                "flex items-center justify-start text-meta text-fg-muted",
              )}
            >
              {unavailable ?? trailing[0] ?? null}
            </span>
            <span className={cn(COL_MENU, "flex items-center justify-end")}>
              {menu}
            </span>
          </div>
          {rowLine !== null ? (
            <span className="truncate ps-12 text-meta text-fg-muted">
              {rowLine}
            </span>
          ) : compactMeta !== "" ? (
            <span className="truncate ps-12 text-meta text-fg-muted @2xl:hidden">
              {compactMeta}
            </span>
          ) : null}
        </div>
      )}
    </WithRowMenu>
  );
}
