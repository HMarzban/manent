// One episode row in a season's episode table: opens its script (or outline when it has none), reads
// DOCUMENT_ROW_LINES, and hosts the in-place editors for Ep, Title, Writer and Due.
import type { EpisodeEntry } from "@manent/crdt";
import { Row } from "@manent/ui";
import type { ReactNode } from "react";
import type { RowPlace } from "../../../services/ports.ts";
import { DOCUMENT_ROW_LINES } from "../document-row-lines.ts";
import { placeProps } from "../row-place.tsx";
import { LastEditedCell, PagesCell, StageCell } from "./episode-cells.tsx";
import { DueCell, EpCell, TitleCell, WriterCell } from "./episode-editors.tsx";
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
  episode: EpisodeEntry;
  targetPages: number | null;
  canEdit: boolean;
  people: readonly SeriesPerson[];
  lastEdited: EpisodeLastEdited;
  place: RowPlace | undefined;
  shell: "web" | "desktop";
  now: number;
  open(docId: string): void;
  onSave(next: EpisodeEntry, renamedTitle?: string | null): void;
}): ReactNode {
  const {
    episode,
    targetPages,
    canEdit,
    people,
    lastEdited,
    shell,
    now,
    open,
    onSave,
  } = props;
  const targetDocId = episode.docIds.script ?? episode.docIds.outline;
  const meta = useEpisodeRowLine(targetDocId);
  const { trailing, ...place } = placeProps(
    targetDocId === null ? DEFAULT_PLACE : (props.place ?? { kind: "synced" }),
    shell,
  );
  return (
    <Row
      meta={meta ?? undefined}
      onActivate={targetDocId === null ? undefined : () => open(targetDocId)}
      trailing={trailing}
      {...place}
    >
      <span className="flex min-w-0 items-center gap-2">
        <EpCell episode={episode} canEdit={canEdit} onSave={onSave} />
        <TitleCell
          episode={episode}
          canEdit={canEdit}
          onSave={(next, nextTitle) => onSave(next, nextTitle)}
        />
        <WriterCell
          episode={episode}
          canEdit={canEdit}
          people={people}
          onSave={onSave}
        />
        <StageCell episode={episode} />
        <DueCell episode={episode} canEdit={canEdit} onSave={onSave} />
        <PagesCell episode={episode} targetPages={targetPages} />
        <LastEditedCell edited={lastEdited} now={now} />
      </span>
    </Row>
  );
}
