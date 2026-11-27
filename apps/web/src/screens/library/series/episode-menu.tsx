// Row menu and context menu entries for an episode row: Script, Outline, Room log, Board, Rename, Number and Library file actions.
import type { EpisodeEntry } from "@manent/crdt";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  SERIES_WORDS,
} from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import {
  Columns3Icon,
  FileTextIcon,
  HashIcon,
  ListTreeIcon,
  NotebookPenIcon,
  PencilIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { DOCUMENT_ROW_ITEMS } from "../document-row-items.ts";

export interface EpisodeMenuItemsProps {
  readonly projectId: string;
  readonly episode: EpisodeEntry;
  readonly canEdit: boolean;
  readonly primaryDocId: string | null;
  readonly unavailable: boolean;
  onOpenDoc(docId: string): void;
  onStartRename(): void;
  onStartEditNumber(): void;
}

export function EpisodeMenuItems(props: EpisodeMenuItemsProps): ReactNode {
  const {
    projectId,
    episode,
    canEdit,
    primaryDocId,
    unavailable,
    onOpenDoc,
    onStartRename,
    onStartEditNumber,
  } = props;
  const navigate = useNavigate();
  const boardHref =
    primaryDocId !== null
      ? `/p/${projectId}/board?season=${encodeURIComponent(episode.seasonId)}&ep=${encodeURIComponent(primaryDocId)}`
      : `/p/${projectId}/board?season=${encodeURIComponent(episode.seasonId)}`;

  return (
    <>
      {episode.docIds.script !== null ? (
        <DropdownMenuItem onClick={() => onOpenDoc(episode.docIds.script!)}>
          <FileTextIcon aria-hidden="true" className="size-icon shrink-0" />
          <span>{SERIES_WORDS.openScript}</span>
        </DropdownMenuItem>
      ) : null}
      {episode.docIds.outline !== null ? (
        <DropdownMenuItem onClick={() => onOpenDoc(episode.docIds.outline!)}>
          <ListTreeIcon aria-hidden="true" className="size-icon shrink-0" />
          <span>{SERIES_WORDS.openOutline}</span>
        </DropdownMenuItem>
      ) : null}
      {episode.docIds.roomLog !== null ? (
        <DropdownMenuItem onClick={() => onOpenDoc(episode.docIds.roomLog!)}>
          <NotebookPenIcon aria-hidden="true" className="size-icon shrink-0" />
          <span>{SERIES_WORDS.openRoomLog}</span>
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuItem onClick={() => void navigate({ href: boardHref })}>
        <Columns3Icon aria-hidden="true" className="size-icon shrink-0" />
        <span>{SERIES_WORDS.openOnBoard}</span>
      </DropdownMenuItem>
      {canEdit ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onStartRename}>
            <PencilIcon aria-hidden="true" className="size-icon shrink-0" />
            <span>{SERIES_WORDS.renameEpisode}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onStartEditNumber}>
            <HashIcon aria-hidden="true" className="size-icon shrink-0" />
            <span>{SERIES_WORDS.changeNumber}</span>
          </DropdownMenuItem>
        </>
      ) : null}
      {primaryDocId !== null &&
      !unavailable &&
      DOCUMENT_ROW_ITEMS.length > 0 ? (
        <>
          <DropdownMenuSeparator />
          {DOCUMENT_ROW_ITEMS.map(({ id, Item }) => (
            <Item key={id} docId={primaryDocId} />
          ))}
        </>
      ) : null}
    </>
  );
}
