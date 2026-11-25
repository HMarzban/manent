// Rundown version rows and shared History list items / author avatars.
import {
  Avatar,
  Button,
  DOCUMENT_WORDS,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  HISTORY_WORDS,
  Row,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  VirtualRows,
  joinNames,
  versionRef,
} from "@manent/ui";
import { StarIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { baselineOfRow } from "../../history/baseline.ts";
import { isTitledByTime } from "../../history/history-rows.ts";
import type { HistoryRow } from "../../history/history-rows.ts";
import { selectRow } from "../../history/history-view.ts";
import type { SettingChange } from "../../history/setting-changes.ts";
import { initialsOf } from "../../initials.ts";
import { useRundownView } from "../../rundown/rundown-session.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { fullNameOf, nameOf } from "../../services/sync/index-entries.ts";
import { historyActions, useHistory } from "../../state/history.store.ts";
import { NameField, nextDraftName, useDraftLadder } from "./draft-name.tsx";
import {
  RundownRestoreDialog,
  openRundownRestore,
} from "./history-rundown-dialog.tsx";

const MORE_WITHIN_ROWS = 50;
const STAR = <StarIcon aria-hidden="true" className="size-icon" />;

export { openRundownRestore } from "./history-rundown-dialog.tsx";

export type HistoryListItem =
  | { kind: "day"; label: string }
  | { kind: "version"; row: HistoryRow }
  | { kind: "setting"; change: SettingChange };

/** Each day's versions and setting changes under its day, newest first; with Drafts only the drafts oldest first. */
export function itemsOfHistoryRows(
  rows: readonly HistoryRow[],
  changes: readonly SettingChange[],
  draftsOnly: boolean,
  now: number,
): HistoryListItem[] {
  if (draftsOnly)
    return rows
      .filter((row) => row.item.kind === "named" || row.item.kind === "sent")
      .toReversed()
      .map((row): HistoryListItem => ({ kind: "version", row }));
  const dated = [
    ...rows.map((row) => ({
      at: row.item.createdAt,
      day: row.day,
      item: { kind: "version", row } satisfies HistoryListItem,
    })),
    ...changes.map((change) => ({
      at: change.at,
      day: HISTORY_WORDS.dayGroup(change.at, now),
      item: { kind: "setting", change } satisfies HistoryListItem,
    })),
  ].toSorted((a, b) => b.at - a.at);
  const items: HistoryListItem[] = [];
  let day: string | null = null;
  for (const each of dated) {
    if (each.day !== day) items.push({ kind: "day", label: each.day });
    day = each.day;
    items.push(each.item);
  }
  return items;
}

/** Avatars of the people whose changes a version holds, named together for a screen reader. */
export function VersionAvatars(props: {
  readonly userIds: readonly string[];
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

/** Version list rows for a rundown: omits script-only scene restore and hides mutating actions when read-only. */
export function RundownVersionRows(props: {
  readonly docId: string;
  readonly rows: readonly HistoryRow[];
  readonly namingTarget: string | null;
  readonly onNameVersion: (versionId: string) => void;
  readonly onCommitName: (draft: string, fromVersionId: string) => void;
  readonly onNearEnd: () => void;
  readonly onShow: (row: HistoryRow) => void;
}): ReactNode {
  const { docId, rows } = props;
  const { commands } = useServices();
  const { now } = useEnvironment();
  const view = useRundownView(docId);
  const canEdit = view?.access === "edit";
  const selected = useHistory("selected");
  const draftsOnly = useHistory("draftsOnly");
  const naming = useHistory("naming");
  const ladder = useDraftLadder(docId);
  const drawnTo = useRef(0);
  const items = itemsOfHistoryRows(rows, [], draftsOnly, now());

  useEffect(() => {
    if (drawnTo.current >= items.length - MORE_WITHIN_ROWS) props.onNearEnd();
  });

  const restoreLabel = commands.state("history.restore").label;
  const nameDraftLabel = commands.state("history.nameDraft").label;

  const renderRow = (index: number): ReactNode => {
    drawnTo.current = Math.max(drawnTo.current, index);
    const item = items[index]!;
    if (item.kind === "day")
      return <h4 className="mn-group-label">{item.label}</h4>;
    if (item.kind !== "version") return null;
    const { row } = item;
    const authors = row.item.summary?.authorUserIds ?? [];
    const named = row.item.kind === "named" || row.item.kind === "sent";
    const title = row.item.name ?? (isTitledByTime(row) ? row.time : row.title);
    const metaText = named
      ? HISTORY_WORDS.namedBy(nameOf(row.item.createdByUserId), row.time)
      : row.item.summary === null || row.item.summary.changes === 0
        ? null
        : HISTORY_WORDS.summary(row.item.summary.changes, 0);
    const onKeyDownCapture = (event: KeyboardEvent): void => {
      if (
        event.key !== "Enter" ||
        !(event.target instanceof Element) ||
        !event.target.classList.contains("mn-row")
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      selectRow(row);
      historyActions.setBaseline(baselineOfRow(row));
      historyActions.setMode("as_it_was");
    };
    const menu = canEdit ? (
      <span onClick={(event) => event.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={DOCUMENT_WORDS.rowMenuName(row.title)}
              />
            }
          >
            <span aria-hidden="true">⋯</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              onClick={() =>
                openRundownRestore({
                  kind: "all",
                  docId,
                  versionId: row.item.id,
                  ref: versionRef(row.item, nameOf),
                })
              }
            >
              {restoreLabel}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => props.onNameVersion(row.item.id)}>
              {nameDraftLabel}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    ) : undefined;
    const isNaming = canEdit && naming && props.namingTarget === row.item.id;
    return (
      <div onKeyDownCapture={onKeyDownCapture}>
        <Row
          selected={selected === row.item.id}
          leading={named ? STAR : undefined}
          meta={
            metaText === null ? undefined : (
              <span title={metaText}>{metaText}</span>
            )
          }
          trailing={[
            ...(authors.length === 0
              ? []
              : [<VersionAvatars key="avatars" userIds={authors} />]),
            ...(row.local === null ? [] : [HISTORY_WORDS.onDevice]),
          ]}
          menu={menu}
          onActivate={() => props.onShow(row)}
        >
          <span title={title}>{title}</span>
        </Row>
        {isNaming ? (
          <NameField
            initial={row.item.name ?? nextDraftName(rows, ladder)}
            onName={(name) => props.onCommitName(name, row.item.id)}
            onCancel={() => historyActions.setNaming(false)}
          />
        ) : null}
      </div>
    );
  };

  return (
    <>
      <VirtualRows
        count={items.length}
        rowHeight="two"
        label={DOCUMENT_WORDS.historyTab}
        renderRow={renderRow}
      />
      <RundownRestoreDialog docId={docId} />
    </>
  );
}
