// History row secondary line rendering and author avatar stack, extracted from history-version-rows.tsx.
import {
  Avatar,
  HISTORY_WORDS,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  joinNames,
} from "@manent/ui";
import type { ReactNode } from "react";
import type { HistoryRow } from "../../history/history-rows.ts";
import { useRowExtensionLine } from "../../history/row-extensions.ts";
import type { RowLine } from "../../history/row-extensions.ts";
import { initialsOf } from "../../initials.ts";
import { fullNameOf, nameOf } from "../../services/sync/index-entries.ts";

/**
 * The avatars of the people whose changes the version holds, named together for a screen reader; each names its
 * person on hover. Drawn without colour: the script's colour for each person is not known here.
 */
export function HistoryAvatars(props: {
  userIds: readonly string[];
}): ReactNode {
  const { userIds } = props;
  if (userIds.length === 0) return null;
  return (
    <span
      role="img"
      aria-label={joinNames(userIds.map(nameOf))}
      className="flex gap-1"
    >
      {userIds.map((userId) => {
        const name = fullNameOf(userId);
        return (
          <Tooltip key={userId}>
            <TooltipTrigger render={<span className="flex" />}>
              <Avatar
                name={name}
                initials={initialsOf(name)}
                colour={null}
                size="sm"
                decorative
              />
            </TooltipTrigger>
            <TooltipContent>{name}</TooltipContent>
          </Tooltip>
        );
      })}
    </span>
  );
}

/** Renders a row extension's second line, allowing 2-line wrap at narrow panel width with full tooltip details. */
export function renderRowLine(line: RowLine): ReactNode {
  if (line.tooltip === null) return line.text;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="line-clamp-2 max-w-full whitespace-normal break-words align-bottom" />
        }
      >
        {line.text}
      </TooltipTrigger>
      <TooltipContent>{line.tooltip}</TooltipContent>
    </Tooltip>
  );
}

/** The row's second line: another feature's, else the draft's namer or the changes it holds; none for an empty version. */
export function useRowMeta(docId: string, row: HistoryRow): ReactNode {
  const chosen = useRowExtensionLine(docId, row.item);
  if (chosen !== null) return renderRowLine(chosen);
  const { item } = row;
  const text =
    item.kind === "named" || item.kind === "sent"
      ? HISTORY_WORDS.namedBy(nameOf(item.createdByUserId), row.time)
      : item.summary === null || item.summary.changes === 0
        ? null
        : HISTORY_WORDS.summary(item.summary.changes, item.summary.scenes);
  return text === null ? null : <span title={text}>{text}</span>;
}
